import Groq from 'groq-sdk';
import { z } from 'zod';

// ─── Provider config ─────────────────────────────────────────────────────────

// Groq primary — openai/gpt-oss-120b
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

// OpenRouter fallback — openai/gpt-oss-120b:free
// Switched 2026-08-20: same model family as Groq primary => consistent JSON schema compliance.
// Free tier on OpenRouter, 131K context window, supports response_format json_object.
// Previous model (google/gemma-4-26b-a4b-it:free) dropped due to repeated
// "temporarily rate-limited upstream" errors from shared Google AI Studio free pool.
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? 'openai/gpt-oss-120b:free';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// ─── Lazy client singletons ───────────────────────────────────────────────────

let _groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (!_groqClient) {
    _groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  }
  return _groqClient;
}

// ─── Error types ──────────────────────────────────────────────────────────────

export class AIUnavailableError extends Error {
  constructor(groqError: unknown, openRouterError: unknown) {
    const groqMsg = groqError instanceof Error ? groqError.message : String(groqError);
    const orMsg = openRouterError instanceof Error ? openRouterError.message : String(openRouterError);
    super(
      `Analysis service is temporarily unavailable, please try again in a few minutes. ` +
      `(Groq: ${groqMsg.slice(0, 120)} | OpenRouter: ${orMsg.slice(0, 120)})`
    );
    this.name = 'AIUnavailableError';
  }
}

/** Thrown when Groq returns HTTP 429 (rate limit) */
export class AIRateLimitError extends Error {
  public readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds = 15) {
    super(`Rate limit reached — please wait a moment and try again.`);
    this.name = 'AIRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Thrown when AI returns structurally invalid JSON */
export class AIInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`AI returned an invalid response. Please try again. (${detail})`);
    this.name = 'AIInvalidResponseError';
  }
}

// ─── Zod schema for AI output validation ─────────────────────────────────────

const PriceOverviewSchema = z.object({
  currency: z.string(),
  initial: z.number(),
  final: z.number(),
  discount_percent: z.number(),
  initial_formatted: z.string().optional(),
  final_formatted: z.string().optional(),
});

const ComparableGameSchema = z.object({
  appid: z.number(),
  name: z.string().min(1),
  developer: z.string().min(1),
  publisher: z.string().default(''),
  owners: z.string().default(''),
  positive: z.number().int().min(0),
  negative: z.number().int().min(0),
  price_usd: z.number().min(0),
  reviewScore: z.number().int().min(0).max(100),
  isBigBudget: z.boolean(),
  relevanceReason: z.string().min(1),
  storyRelevance: z.string().nullable().optional(),
  // Injected post-AI: live regional prices from Steam Store API
  price: z.object({
    us: PriceOverviewSchema.optional(),
    tr: PriceOverviewSchema.optional(),
  }).optional(),
});

const AnalysisResultSchema = z.object({
  comparableGames: z.array(ComparableGameSchema).min(1),
  marketContext: z.string().min(10),
  riskFactors: z.array(z.string().min(1)).min(1),
  opportunities: z.array(z.string().min(1)).min(1),
  storyNarrative: z.string().nullable().optional(),
  disclaimer: z.string().default(
    'This analysis is based on data from SteamSpy and Steam Web API. All ownership and revenue figures are estimates with significant uncertainty. Bearing does not guarantee any commercial outcome.'
  ),
});

// ─── Shared types ─────────────────────────────────────────────────────────────

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export interface AnalysisGame {
  appid: number;
  name: string;
  developer: string;
  publisher: string;
  owners: string;
  positive: number;
  negative: number;
  price_usd: number;
  description: string;
  tags: string[];
}

// ─── Prompt builders ──────────────────────────────────────────────────────────
// Token budget (Groq free tier: 6K TPM input):
//   System prompt ≈  720 tokens
//   Game list     ≈   30 games x ~55 tokens = ~1,650 tokens  (description removed)
//   User prompt   ≈   80 tokens
//   Total input   ≈ 2,450 tokens  — well within 6K TPM, halved vs. previous
//   Max output    = 2,048 tokens  (8 games x ~200 + context/risks/opps ~450)
// Removing the description field saves ~80 tokens/game (~2,400 total for 30 games),
// freeing output budget so the full JSON response is never truncated at 1,500.

function buildGameContext(games: AnalysisGame[]): string {
  return games
    .map((g) => {
      const total = g.positive + g.negative;
      const score = total > 0 ? Math.round((g.positive / total) * 100) : 0;
      // ~55 tokens/game: appid, name, dev, price, score%, owners, top tags.
      // Description intentionally omitted — saves ~80 tok/game, tags already capture genre signal.
      return (
        `[${g.appid}] "${g.name}" by ${g.developer}` +
        ` | $${g.price_usd.toFixed(2)} | score:${score}%` +
        ` | ${g.owners} owners | Tags:${g.tags.slice(0, 8).join(',')}`
      );
    })
    .join('\n');
}

function buildPrompts(
  genres: string[],
  mechanics: string,
  story: string | undefined,
  platform: string,
  games: AnalysisGame[]
): { systemPrompt: string; userPrompt: string } {
  const gameContext = buildGameContext(games);

  const systemPrompt = `You are Bearing, a market context tool for indie game developers.

RULES:
1. Only reference games from the provided list. Never invent titles.
2. Select 5-8 games that GENUINELY match the genre tags AND mechanics. Prefer games whose Tags include the queried genres.
3. When multiple genres are selected, prefer games matching ALL of them simultaneously.
4. Skip games that don't match the genre, even if popular.
5. Use hedged language: "based on this data", "one risk is", "in this context". No absolute predictions.
6. Flag AA/AAA games with isBigBudget:true.
7. reviewScore MUST be an integer between 0 and 100 — it is a percentage (e.g. 82 = 82% positive). NEVER return a raw review count or any number above 100.

RESPOND WITH VALID JSON ONLY. No markdown, no preamble. Output the COMPLETE JSON without truncation. Use this exact schema:
{"comparableGames":[{"appid":number,"name":"string","developer":"string","publisher":"string","owners":"string","positive":number,"negative":number,"price_usd":number,"reviewScore":number,"isBigBudget":boolean,"relevanceReason":"1-2 sentences mentioning shared tags/mechanics","storyRelevance":"string or null"}],"marketContext":"3-4 sentence paragraph","riskFactors":["risk1","risk2","risk3"],"opportunities":["opp1","opp2","opp3"],"storyNarrative":"string or null","disclaimer":"This analysis is based on data from SteamSpy and Steam Web API. All ownership and revenue figures are estimates with significant uncertainty. Bearing does not guarantee any commercial outcome."}`;

  const userPrompt = `GAMES (use ONLY these):
${gameContext}

IDEA:
Genres: ${genres.join(', ')}
Mechanics: ${mechanics.slice(0, 300)}
Story: ${story ? story.slice(0, 200) : 'none'}
Platform: ${platform}

Pick 5-8 matching games, give market context, risks, opportunities.`;

  return { systemPrompt, userPrompt };
}

// ─── JSON parsing + Zod validation ───────────────────────────────────────────

function parseAndValidateAiJson(content: string): AnalysisResult {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new AIInvalidResponseError(`Not valid JSON: ${content.slice(0, 200)}`);
  }

  const result = AnalysisResultSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new AIInvalidResponseError(`Schema validation failed: ${issues}`);
  }

  return result.data;
}

// ─── Rate-limit helper ────────────────────────────────────────────────────────

function isRateLimit(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit_exceeded');
  }
  return false;
}

function extractRetryAfter(err: unknown): number {
  if (err instanceof Error) {
    const match = err.message.match(/try again in (\d+(?:\.\d+)?)s/i);
    if (match) return Math.ceil(parseFloat(match[1]));
  }
  return 15;
}

// ─── Retry config ────────────────────────────────────────────────────────────
//
// Groq:        max 2 attempts (1 initial + 1 retry), 1.5 s pause between them.
//              json_validate_failed (400) is transient — a second call usually
//              succeeds because the model's sampling is non-deterministic.
//
// OpenRouter:  deliberately 1 attempt only.
//              Each call takes 45-55 s on the free tier; two attempts would
//              consume ≥ 90-110 s, leaving < 10-30 s for SteamSpy + Steam API
//              overhead and risking the 120 s maxDuration hard limit.
//              Retry is not worth the reliability risk here.

const GROQ_MAX_ATTEMPTS = 2;
const GROQ_RETRY_DELAY_MS = 1500;

/** Resolves after `ms` milliseconds. */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** True when Groq rejects the call because the model produced invalid JSON (HTTP 400 json_validate_failed). */
function isJsonValidateFailed(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('json_validate_failed');
  }
  return false;
}

// ─── OpenRouter call ──────────────────────────────────────────────────────────

async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set — cannot use OpenRouter as fallback.'
    );
  }

  const controller = new AbortController();
  // 90s — stays within the 120s maxDuration with room for the rest of the pipeline
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://bearing.app',
        'X-Title': 'Bearing - Indie Game Idea Validator',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2048, // raised from 1500: 8 games x ~200 tok + context/risks/opps ~450 = ~2,050
        response_format: { type: 'json_object' },
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter returned empty content');
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Analyzes a game idea using real Steam data.
 *
 * Provider cascade:
 *  1. Groq (openai/gpt-oss-120b) — primary, up to GROQ_MAX_ATTEMPTS attempts.
 *     Retried on transient failures (json_validate_failed / empty content).
 *     Rate-limit (429) skips remaining Groq retries and falls through immediately.
 *  2. OpenRouter (openai/gpt-oss-120b:free) — single attempt fallback.
 *     Same model family as Groq -> consistent schema behaviour.
 *     Not retried: each call takes 45-55 s; a second attempt risks the 120 s limit.
 *
 * Error types thrown:
 *  - AIRateLimitError       — BOTH providers returned 429
 *  - AIInvalidResponseError — AI returned malformed JSON (both providers exhausted)
 *  - AIUnavailableError     — both providers failed for other reasons
 */
export async function analyzeIdea(
  genres: string[],
  mechanics: string,
  story: string | undefined,
  platform: string,
  games: AnalysisGame[]
): Promise<AnalysisResult> {
  const { systemPrompt, userPrompt } = buildPrompts(genres, mechanics, story, platform, games);

  // ── 1. Try Groq (with retry) ──────────────────────────────────────────────
  let groqError: unknown = null;

  if (process.env.GROQ_API_KEY) {
    for (let attempt = 1; attempt <= GROQ_MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`[AI] Groq attempt ${attempt}/${GROQ_MAX_ATTEMPTS} | model: ${GROQ_MODEL}`);
        const response = await getGroqClient().chat.completions.create({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 2048, // raised from 1500: 8 games x ~200 tok + context/risks/opps ~450 = ~2,050
          response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('Groq returned empty content');

        const result = parseAndValidateAiJson(content);
        console.log(
          `[AI] provider used: groq | model: ${GROQ_MODEL} | attempt: ${attempt}/${GROQ_MAX_ATTEMPTS}`
        );
        return result;
      } catch (err) {
        groqError = err;

        // Rate-limit: independent from OpenRouter budget, fall through immediately.
        if (isRateLimit(err)) {
          const retryAfter = extractRetryAfter(err);
          console.warn(
            `[AI] Groq attempt ${attempt}/${GROQ_MAX_ATTEMPTS} — rate limit (429). ` +
            `Retry in ${retryAfter}s. Skipping remaining Groq attempts, falling back to OpenRouter.`
          );
          break; // exit loop; go straight to OpenRouter
        }

        if (attempt < GROQ_MAX_ATTEMPTS) {
          const reason = isJsonValidateFailed(err)
            ? 'json_validate_failed'
            : err instanceof Error ? err.message.slice(0, 100) : String(err);
          console.warn(
            `[AI] Groq attempt ${attempt}/${GROQ_MAX_ATTEMPTS} failed (${reason}). ` +
            `Retrying in ${GROQ_RETRY_DELAY_MS}ms...`
          );
          await sleep(GROQ_RETRY_DELAY_MS);
        } else {
          console.warn(
            `[AI] Groq failed after ${GROQ_MAX_ATTEMPTS} attempt(s) — falling back to OpenRouter.`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }
  } else {
    groqError = new Error('GROQ_API_KEY not set — skipping Groq');
    console.warn('[AI] GROQ_API_KEY not set — skipping Groq, trying OpenRouter directly.');
  }

  // ── 2. Try OpenRouter (1 attempt — see RETRY CONFIG note above) ──────────
  let openRouterError: unknown = null;

  try {
    console.log(`[AI] OpenRouter attempt 1/1 | model: ${OPENROUTER_MODEL}`);
    const content = await callOpenRouter(systemPrompt, userPrompt);
    const result = parseAndValidateAiJson(content);
    console.log('[AI] provider used: openrouter | model:', OPENROUTER_MODEL);
    return result;
  } catch (err) {
    openRouterError = err;
    console.error(
      '[AI] OpenRouter also failed.',
      err instanceof Error ? err.message : err
    );
  }

  // ── 3. Both failed ───────────────────────────────────────────────────────
  // If BOTH providers hit a rate-limit, surface it as AIRateLimitError so
  // the user sees a clear "wait N seconds" message instead of a generic 503.
  if (isRateLimit(groqError) && isRateLimit(openRouterError)) {
    const retryAfter = Math.max(
      extractRetryAfter(groqError),
      extractRetryAfter(openRouterError)
    );
    console.warn(`[AI] Both providers rate-limited. Suggest retry in ${retryAfter}s.`);
    throw new AIRateLimitError(retryAfter);
  }

  throw new AIUnavailableError(groqError, openRouterError);
}
