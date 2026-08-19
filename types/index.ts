export const GENRES = [
  { value: 'roguelike', label: 'Roguelike' },
  { value: 'deckbuilder', label: 'Deckbuilder' },
  { value: 'platformer', label: 'Platformer' },
  { value: 'rpg', label: 'RPG' },
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'action-roguelike', label: 'Action Roguelike' },
  { value: 'metroidvania', label: 'Metroidvania' },
  { value: 'turn-based', label: 'Turn-Based Strategy' },
  { value: 'survival', label: 'Survival' },
  { value: 'horror', label: 'Horror' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'visual-novel', label: 'Visual Novel' },
  { value: 'simulation', label: 'Simulation' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'tower-defense', label: 'Tower Defense' },
  { value: 'bullet-hell', label: 'Bullet Hell' },
] as const;

export const PLATFORMS = [
  { value: 'steam', label: 'Steam (PC)' },
  { value: 'steam-console', label: 'Steam + Console' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'console', label: 'Console only' },
] as const;

export interface AnalyzeFormData {
  genres: string[];
  mechanics: string;
  story?: string;
  platform: string;
}

export interface ComparableGame {
  appid: number;
  name: string;
  developer: string;
  publisher: string;
  owners: string;
  positive: number;
  negative: number;
  price_usd: number;
  price?: {
    us?: { initial: number; final: number; discount_percent: number; currency: string };
    tr?: { initial: number; final: number; discount_percent: number; currency: string };
  };
  reviewScore: number;
  isBigBudget: boolean;
  relevanceReason: string;
  storyRelevance?: string | null;
}

export interface AnalysisResponse {
  comparableGames: ComparableGame[];
  marketContext: string;
  riskFactors: string[];
  opportunities: string[];
  storyNarrative?: string | null;
  disclaimer: string;
  meta: {
    gamesInDatabase: number;
    genresQueried: string[];
    generatedAt: string;
  };
}
