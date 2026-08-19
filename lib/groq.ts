import Groq from 'groq-sdk';

// llama-3.3-70b-versatile was deprecated by Groq on 2026-06-17.
// Official migration target: openai/gpt-oss-120b
// JSON mode (response_format: { type: 'json_object' }) is supported — syntax unchanged.
// The system prompt already contains the word "JSON" which this model requires for JSON mode.
const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

/** Lazily instantiated to avoid build-time failures when env vars aren't set */
let _groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (!_groqClient) {
    _groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  }
  return _groqClient;
}


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

export interface AnalysisResult {
  comparableGames: Array<{
    appid: number;
    name: string;
    developer: string;
    publisher: string;
    owners: string;
    positive: number;
    negative: number;
    price_usd: number;
    reviewScore: number; // 0-100
    isBigBudget: boolean;
    relevanceReason: string;
    storyRelevance?: string;
  }>;
  marketContext: string;
  riskFactors: string[];
  opportunities: string[];
  storyNarrative?: string;
  disclaimer: string;
}

function buildGameContext(games: AnalysisGame[]): string {
  return games
    .map((g) => {
      const total = g.positive + g.negative;
      const score = total > 0 ? Math.round((g.positive / total) * 100) : 0;
      return `- AppID: ${g.appid} | "${g.name}" by ${g.developer} | Owners: ${g.owners} | Price: $${g.price_usd.toFixed(2)} | Review score: ${score}% (${total.toLocaleString()} reviews) | Tags: ${g.tags.slice(0, 6).join(', ')} | Description snippet: ${g.description.slice(0, 200).replace(/\n/g, ' ')}`;
    })
    .join('\n');
}

export async function analyzeIdea(
  genres: string[],
  mechanics: string,
  story: string | undefined,
  platform: string,
  games: AnalysisGame[]
): Promise<AnalysisResult> {
  const gameContext = buildGameContext(games);

  const systemPrompt = `You are Bearing, a calm and honest market context tool for indie game developers.

CRITICAL RULES:
1. You MUST only reference games from the provided list. Do NOT invent or recall any game not in the list.
2. You MUST select 5-8 of the most relevant games from the list to highlight as "comparable games".
3. Never make absolute predictions ("this will succeed/fail"). Use language like "in this context", "based on this data", "one risk is", "one opportunity is".
4. Always acknowledge data limitations. SteamSpy estimates have significant uncertainty ranges.
5. If a comparable game is from a AA or AAA studio (large publisher, high budget), note that its success cannot be directly compared to an indie project.
6. Your tone is a compass, not a verdict — you show direction and context, not certainty.

OUTPUT FORMAT: Respond with valid JSON only, no markdown fences, matching this exact structure:
{
  "comparableGames": [
    {
      "appid": <number from the list>,
      "name": "<exact name from the list>",
      "developer": "<exact developer from the list>",
      "publisher": "<exact publisher from the list>",
      "owners": "<exact owners string from the list>",
      "positive": <number>,
      "negative": <number>,
      "price_usd": <number>,
      "reviewScore": <0-100 integer>,
      "isBigBudget": <true if the studio/publisher is clearly AA/AAA, false otherwise>,
      "relevanceReason": "<1-2 sentences on why this game is comparable to the user's idea>",
      "storyRelevance": "<only if user provided a story — 1 sentence on story/theme similarity, else null>"
    }
  ],
  "marketContext": "<3-4 sentence paragraph describing the market landscape for this genre/mechanic combination, based purely on the data provided>",
  "riskFactors": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "opportunities": ["<opportunity 1>", "<opportunity 2>", "<opportunity 3>"],
  "storyNarrative": "<if user provided a story: 2-3 sentences on how the story/theme compares to games in the list; else null>",
  "disclaimer": "This analysis is based on data from SteamSpy and Steam Web API. All ownership and revenue figures are estimates with significant uncertainty. Bearing does not guarantee any commercial outcome."
}`;

  const userPrompt = `GAME DATABASE (use ONLY these games):
${gameContext}

USER'S GAME IDEA:
- Genres/Tags: ${genres.join(', ')}
- Core Mechanics: ${mechanics}
- Story/Concept: ${story || 'Not provided'}
- Target Platform: ${platform}

Select 5-8 comparable games from the database above. Provide market context, risks, and opportunities.`;

  const response = await getGroqClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 2500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('AI returned empty response');

  try {
    const parsed = JSON.parse(content) as AnalysisResult;
    return parsed;
  } catch {
    throw new Error(`AI response was not valid JSON: ${content.slice(0, 200)}`);
  }
}
