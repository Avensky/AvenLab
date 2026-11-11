export const CHARACTER_PERSONALITIES = [
  { id: "friendly", label: "Friendly", emotes: ["005", "010", "035", "009"] },
  { id: "playful", label: "Playful", emotes: ["021", "023", "026", "robot-dance"] },
  { id: "shy", label: "Shy", emotes: ["035", "036", "037", "038"] },
  { id: "tsundere", label: "Tsundere", emotes: ["041", "042", "043", "044"] },
  { id: "stoic", label: "Stoic", emotes: ["131", "132", "133", "134"] },
  { id: "elegant", label: "Elegant", emotes: ["113", "114", "115", "116"] },
  { id: "racer", label: "Racer", emotes: ["081", "082", "083", "084"] },
  { id: "scientist", label: "Scientist", emotes: ["157", "158", "159", "160"] },
] as const;
export type CharacterPersonality = typeof CHARACTER_PERSONALITIES[number]["id"];
export type AnimationFit = "auto" | "full" | "fitted";

export function personalityEmote(personality: CharacterPersonality = "friendly", previous?: string, random = Math.random()) {
  const pool = CHARACTER_PERSONALITIES.find(item => item.id === personality)?.emotes ?? CHARACTER_PERSONALITIES[0].emotes;
  const options = pool.filter(id => id !== previous);
  return options[Math.min(options.length - 1, Math.floor(Math.max(0, random) * options.length))];
}
