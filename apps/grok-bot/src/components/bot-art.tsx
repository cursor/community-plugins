"use client";

import type { CSSProperties } from "react";
import { type Body, botFaceUrl, type Face, inkForColor } from "@/lib/avatar";
import { BotRig } from "./bot-rig";

// Static bot art is the brand tool's Grok Bot faces used as CSS masks;
// animated bots use the avatar engine (bot-rig.tsx) on the same geometry.

type ArtProps = {
  body: Body;
  color: string;
  className?: string;
  label?: string;
};

function inkStyle(color: string): CSSProperties {
  const [light, dark] = inkForColor(color);
  return { "--ink-light": light, "--ink-dark": dark } as CSSProperties;
}

const faceStyle = (body: Body, face: Face) =>
  ({ "--face": `url(${botFaceUrl(body, face)})` }) as CSSProperties;

function a11y(label?: string) {
  return label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };
}

export function BotArt({
  body,
  color,
  face = "neutral",
  className = "",
  label,
}: ArtProps & { face?: Face }) {
  return (
    <span
      className={`bot-art ${className}`}
      style={inkStyle(color)}
      {...a11y(label)}
    >
      <span className="face" style={faceStyle(body, face)} />
    </span>
  );
}

// Faces each body rests in, so a page of bots doesn't all look the same.
const REST_FACES: Face[] = [
  "neutral",
  "calm",
  "inspecting",
  "happy",
  "neutral",
  "calm",
];
export function restFaceFor(seed: string): Face {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return REST_FACES[h % REST_FACES.length];
}

/** List-row bot: looks at the pointer, blinks, turns happy and hops on hover. */
export function RowBot({ body, color, seed }: ArtProps & { seed: string }) {
  return (
    <BotRig
      shape={body}
      color={color}
      face={restFaceFor(seed)}
      mode="row"
      className="row-bot"
      testId="row-bot"
    />
  );
}

/**
 * Bot on a card (Your bots, admin): behaves like a list-row bot while the
 * pointer is over the closest `[data-rig-hover]` element.
 */
export function CardBot({
  body,
  color,
  seed,
  className = "sub-mark",
}: ArtProps & { seed: string }) {
  return (
    <BotRig
      shape={body}
      color={color}
      face={restFaceFor(seed)}
      mode="row"
      className={className}
      testId="card-bot"
    />
  );
}

/** A page's single bot (submit preview, empty states): watches the pointer. */
export function SceneBot({
  body,
  color,
  face,
  seed,
  className,
  label,
  testId = "scene-bot",
}: ArtProps & { face?: Face; seed?: string; testId?: string }) {
  return (
    <BotRig
      shape={body}
      color={color}
      face={face ?? restFaceFor(seed ?? body)}
      mode="detail"
      className={className}
      label={label}
      testId={testId}
    />
  );
}

/** Detail-page bot: follows the pointer, blinks, glances around when idle. */
export function DetailBot({
  body,
  color,
  seed,
  label,
}: ArtProps & { seed: string }) {
  return (
    <BotRig
      shape={body}
      color={color}
      face={restFaceFor(seed)}
      mode="detail"
      className="detail-bot"
      testId="detail-bot"
      label={label}
    />
  );
}

const HERO_REST = { x: 0.45, y: -0.3 };

/** The bot in the headline: follows the cursor anywhere on the page. */
export function HeroBot() {
  return (
    <BotRig
      shape="blob-front"
      color="black"
      mode="hero"
      rest={HERO_REST}
      className="hero-rig"
      testId="hero-bot"
    />
  );
}
