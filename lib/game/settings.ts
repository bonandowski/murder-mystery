import { z } from "zod";

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;

export const SETTING_PRESETS = {
  villa_20s: "Villa di campagna negli anni '20, festa di fidanzamento",
  cruise: "Nave da crociera di lusso durante la cena del capitano",
  castle: "Castello medievale durante un banchetto del signore",
  film_set: "Set cinematografico la sera dell'ultimo ciak",
  wedding: "Ricevimento di matrimonio in una tenuta in Toscana",
  office: "Festa aziendale di fine anno in una startup milanese",
} as const;
export type SettingPreset = keyof typeof SETTING_PRESETS;

export const TONES = {
  classic: "Giallo classico alla Agatha Christie",
  noir: "Noir cupo e ironico",
  comic: "Commedia brillante, situazioni assurde",
  horror: "Horror leggero, atmosfera inquietante ma senza splatter",
} as const;
export type Tone = keyof typeof TONES;

export const DIFFICULTIES = {
  easy: "Facile",
  medium: "Media",
  hard: "Difficile",
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;

export const DURATIONS = [60, 90, 120, 150, 180] as const;

export const gameSettingsSchema = z.object({
  settingPreset: z.enum([...(Object.keys(SETTING_PRESETS) as [SettingPreset, ...SettingPreset[]]), "custom"]),
  customSetting: z.string().max(400).default(""),
  tone: z.enum(Object.keys(TONES) as [Tone, ...Tone[]]),
  durationMin: z.number().int().min(60).max(180),
  difficulty: z.enum(Object.keys(DIFFICULTIES) as [Difficulty, ...Difficulty[]]),
  notes: z.string().max(400).default(""),
});
export type GameSettings = z.infer<typeof gameSettingsSchema>;

export const DEFAULT_SETTINGS: GameSettings = {
  settingPreset: "villa_20s",
  customSetting: "",
  tone: "classic",
  durationMin: 120,
  difficulty: "medium",
  notes: "",
};

export function parseSettings(raw: unknown): GameSettings {
  const parsed = gameSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function settingDescription(s: GameSettings): string {
  if (s.settingPreset === "custom") return s.customSetting.trim() || SETTING_PRESETS.villa_20s;
  return SETTING_PRESETS[s.settingPreset];
}

/** Quante side quest per personaggio in base alla difficoltà. */
export function sideQuestsPerCharacter(d: Difficulty): number {
  return d === "easy" ? 0 : d === "medium" ? 1 : 2;
}

export function sideQuestPoints(d: Difficulty): number {
  return d === "hard" ? 3 : 2;
}

export function redHerringCount(d: Difficulty): number {
  return d === "easy" ? 1 : d === "medium" ? 3 : 4;
}
