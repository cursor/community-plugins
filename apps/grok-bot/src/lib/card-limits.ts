// How long a bot's name and description may be when stored (the check
// constraints on grok_bots). A share card can say more: some put the bot's
// whole brief in its description.
export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 2000;

/** `text` cut to `max` characters, at a word where there is one, with "…". */
export function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const atWord = cut.replace(/\s+\S*$/, "");
  // A single very long word is cut where the room ends.
  return `${(atWord.length > max * 0.8 ? atWord : cut).trimEnd()}…`;
}
