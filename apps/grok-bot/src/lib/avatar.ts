// Bot art: the 12 Grok Bot bodies from the brand tool's grok-bot-expression
// template (public/bots/<body>/<face>.svg), shown as CSS masks and tinted
// with the Grok Bot ink palette.

export const BODIES = [
  "blob",
  "cloud",
  "square",
  "sparkle",
  "clover",
  "flower",
  "teardrop",
  "tablet",
  "wedge",
  "heart",
  "hex",
  "house",
] as const;
export type Body = (typeof BODIES)[number];

// Grok Bot templates name the engine's shapes. The brand tool maps the
// retired ones onto the current 12 bodies; this follows that mapping.
const BODY_FOR_SHAPE: Record<string, Body> = {
  sphere: "blob",
  blob: "blob",
  pebble: "blob",
  bean: "blob",
  egg: "blob",
  dome: "blob",
  cloud: "cloud",
  square: "square",
  squircle: "square",
  sparkle: "sparkle",
  crystal: "sparkle",
  clover: "clover",
  starFlower: "flower",
  flower: "flower",
  teardrop: "teardrop",
  leaf: "teardrop",
  tablet: "tablet",
  capsule: "tablet",
  cylinder: "tablet",
  wedge: "wedge",
  heartChubby: "heart",
  heart: "heart",
  shield: "heart",
  hex: "hex",
  cube: "hex",
  gem: "hex",
  house: "house",
  arch: "house",
};

export function bodyForShape(shape: string): Body {
  return BODY_FOR_SHAPE[shape] ?? "blob";
}

export const FACES = [
  "neutral",
  "calm",
  "happy",
  "inspecting",
  "sleepy",
  "squinted",
  "surprised",
  "confused",
  "sad",
] as const;
export type Face = (typeof FACES)[number];

// Grok Bot ink per template color, [light theme, dark theme] (the desktop
// app's GROK_BOT_INK table).
const INK: Record<string, readonly [string, string]> = {
  black: ["#000000", "#FFFFFF"],
  brown: ["#A27952", "#855C36"],
  red: ["#FF3E51", "#E02135"],
  orange: ["#FF781C", "#FF6700"],
  yellow: ["#FFAF38", "#FF9800"],
  green: ["#00C972", "#009957"],
  cyan: ["#1CC3B0", "#00A592"],
  blue: ["#2A92FE", "#0E74E0"],
  violet: ["#A97EFE", "#804EE0"],
  magenta: ["#FF5EB1", "#E02A88"],
  gray: ["#959595", "#777777"],
};

export function inkForColor(color: string): readonly [string, string] {
  return INK[color] ?? INK.gray;
}

export const botFaceUrl = (body: Body, face: Face) =>
  `/bots/${body}/${face}.svg`;
