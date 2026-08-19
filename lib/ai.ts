import Groq from 'groq-sdk';
import { z } from 'zod';

// ─── Provider config ─────────────────────────────────────────────────────────

// Groq primary — openai/gpt-oss-120b
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

// OpenRouter fallback — google/gemma-4-26b-a4b-it:free
// ✅ Verified free ($0/token) on 2026-08-17 via /api/v1/models.
// ✅ Supports response_format: { type: 'json_object' } and actually returns valid JSON.
// ✅ 262K context window, ample for our ~3K-token prompts.
// Previous models returned HTTP 404 (unavailable for free), empty content, or 429 rate limit upstream.
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? 'google/gemma-4-26b-a4b-it:free';

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
// Keep per-game context COMPACT to stay within Groq's 8K TPM limit.
// Each game entry is ~120 tokens. With 30 games, the game list ≈ 3,600 tokens.
// The system prompt is ~650 tokens. User prompt header ~80 tokens.
// Total input ≈ 4,300 tokens — well within 8K TPM.
// Max output = 1,500 tokens (5-8 games × ~180 tokens + context ~300 tokens).

function buildGameContext(games: AnalysisGame[]): string {
  return games
    .map((g) => {
      const total = g.positive + g.negative;
      const score = total > 0 ? Math.round((g.positive / total) * 100) : 0;
      // Compact format: ~100 tokens per game
      return `[${g.appid}] "${g.name}" by ${g.developer} | $${g.price_usd.toFixed(2)} | +${g.positive} -${g.negative} (${score}%) | Owners:${g.owners} | Tags:${g.tags.slice(0, 8).join(',')} | ${g.description.slice(0, 120).replace(/\n/g, ' ')}`;
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

RESPOND WITH VALID JSON ONLY. No markdown, no preamble. Use this exact schema:
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
  const timeout = setTimeout(() => controller.abort(), 55_000);

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
        max_tokens: 1500,
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
 *  1. Groq  (openai/gpt-oss-120b)   — primary, fast, 8K TPM free tier
 *  2. OpenRouter (openai/gpt-oss-20b:free) — fallback, verified free 2026-08-17
 *
 * Error types thrown:
 *  - AIRateLimitError      — Groq 429, user should wait
 *  - AIInvalidResponseError — AI returned malformed JSON (both providers)
 *  - AIUnavailableError    — both providers failed for other reasons
 */
export async function analyzeIdea(
  genres: string[],
  mechanics: string,
  story: string | undefined,
  platform: string,
  games: AnalysisGame[]
): Promise<AnalysisResult> {
  const { systemPrompt, userPrompt } = buildPrompts(genres, mechanics, story, platform, games);

  // ── 1. Try Groq ──────────────────────────────────────────────────────────
  let groqError: unknown = null;

  if (process.env.GROQ_API_KEY) {
    try {
      const response = await getGroqClient().chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Groq returned empty content');

      const result = parseAndValidateAiJson(content);
      console.log('[AI] provider used: groq | model:', GROQ_MODEL);
      return result;
    } catch (err) {
      groqError = err;

      // Propagate rate-limit immediately — no point trying the fallback for 429
      // (the fallback has its own separate rate limit)
      if (isRateLimit(err)) {
        const retryAfter = extractRetryAfter(err);
        console.warn(`[AI] Groq rate limit hit (429). Retry in ${retryAfter}s.`);
        throw new AIRateLimitError(retryAfter);
      }

      console.warn(
        '[AI] Groq failed — falling back to OpenRouter.',
        err instanceof Error ? err.message : err
      );
    }
  } else {
    groqError = new Error('GROQ_API_KEY not set — skipping Groq');
    console.warn('[AI] GROQ_API_KEY not set — skipping Groq, trying OpenRouter directly.');
  }

  // ── 2. Try OpenRouter ────────────────────────────────────────────────────
  let openRouterError: unknown = null;

  try {
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
  throw new AIUnavailableError(groqError, openRouterError);
}
