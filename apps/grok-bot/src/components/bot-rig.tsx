"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { type Body, type Face, inkForColor } from "@/lib/avatar";

/** The 12 bodies, plus the round bot facing front (used by the headline). */
export type RigShape = Body | "blob-front";
const metaFor = (shape: RigShape) =>
  RIG_META[shape === "blob-front" ? "blobFront" : shape];

import { RIG_META } from "@/lib/rig-meta";

/**
 * Grok Bot avatar engine (2.5D). The geometry is the brand tool's: each
 * shape's body and per-expression eyes, split losslessly from the official
 * faces by src/scripts/build-rig.ts into public/rig/<shape>.svg. This engine
 * only moves them:
 *   - gaze: the eyes slide toward a target and foreshorten, the body leans;
 *   - blink: the eyes squash shut and open;
 *   - expressions: official eye sets crossfade;
 *   - hop: a squash-and-stretch jump.
 * One requestAnimationFrame loop per bot writes SVG transforms directly (no
 * React renders) and sleeps when everything is at rest.
 */

type Vec = { x: number; y: number };
type Mode = "row" | "detail" | "hero";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t;

// A damped spring; settles without overshooting much.
class Spring {
  value: number;
  velocity = 0;
  target: number;
  constructor(
    value: number,
    private stiffness = 170,
    private damping = 22,
  ) {
    this.value = value;
    this.target = value;
  }
  step(dt: number) {
    const force =
      this.stiffness * (this.target - this.value) -
      this.damping * this.velocity;
    this.velocity += force * dt;
    this.value += this.velocity * dt;
  }
  get settled() {
    return (
      Math.abs(this.target - this.value) < 0.0005 &&
      Math.abs(this.velocity) < 0.0005
    );
  }
}

// Brief and predictable, so these are timed curves, not springs.
const BLINK_CLOSE = 70;
const BLINK_OPEN = 110;
const FACE_FADE = 140;
const HOP = 460;

class Rig {
  private gx: Spring;
  private gy: Spring;
  private rest: Vec;
  private blinks: number[] = [];
  private hopStart = -1;
  private fade: {
    from: Record<string, number>;
    to: Face;
    start: number;
  } | null = null;
  private weights: Record<string, number>;
  private raf = 0;
  private last = 0;
  private box: {
    cx: number;
    cy: number;
    bottom: number;
    w: number;
    h: number;
    ex: number;
    ey: number;
    ehw: number;
    ehh: number;
  };

  constructor(
    private bodyEl: SVGGElement,
    private eyesEl: SVGGElement,
    private faceEls: Map<Face, SVGUseElement>,
    shape: RigShape,
    restFace: Face,
    rest: Vec,
  ) {
    const m = metaFor(shape);
    const [x0, y0, x1, y1] = m.body;
    const [ex0, ey0, ex1, ey1] = m.eyes;
    this.box = {
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      bottom: y1,
      w: x1 - x0,
      h: y1 - y0,
      ex: (ex0 + ex1) / 2,
      ey: (ey0 + ey1) / 2,
      ehw: (ex1 - ex0) / 2,
      ehh: (ey1 - ey0) / 2,
    };
    this.rest = rest;
    this.gx = new Spring(rest.x);
    this.gy = new Spring(rest.y);
    this.weights = Object.fromEntries(
      [...faceEls.keys()].map((f) => [f, f === restFace ? 1 : 0]),
    );
    this.render(performance.now());
  }

  /** Look toward a direction (x, y in -1..1), or back to the rest pose. */
  lookAt(dir: Vec | null) {
    const d = dir ?? this.rest;
    const len = Math.hypot(d.x, d.y);
    const k = len > 1 ? 1 / len : 1;
    this.gx.target = d.x * k;
    this.gy.target = d.y * k;
    this.wake();
  }

  blink(times = 1) {
    const now = performance.now();
    for (let i = 0; i < times; i++)
      this.blinks.push(now + i * (BLINK_CLOSE + BLINK_OPEN + 60));
    this.wake();
  }

  setFace(face: Face) {
    if (!this.faceEls.has(face)) return;
    this.fade = {
      from: { ...this.weights },
      to: face,
      start: performance.now(),
    };
    this.wake();
  }

  hop() {
    this.hopStart = performance.now();
    this.wake();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  /**
   * How much of an eye offset fits, so eyes never slide off the edge. The
   * eyes' bounds, measured against the body's ellipse, may go anywhere inside
   * it, or anywhere no further out than the official face puts them (the
   * round bot's eyes already sit near its upper right).
   */
  private fit(tx: number, ty: number, sx: number, sy: number): number {
    const { cx, cy, w, h, ex, ey, ehw, ehh } = this.box;
    const a = w / 2;
    const b = h / 2;
    const reach = (t: number) => {
      const x = ex + tx * t - cx;
      const y = ey + ty * t - cy;
      let worst = 0;
      for (const i of [-1, 1])
        for (const j of [-1, 1])
          worst = Math.max(
            worst,
            ((x + i * ehw * sx) / a) ** 2 + ((y + j * ehh * sy) / b) ** 2,
          );
      return worst;
    };
    const limit = Math.max(0.92, reach(0));
    const inside = (t: number) => reach(t) <= limit;
    if (inside(1)) return 1;
    let lo = 0;
    let hi = 1;
    for (let n = 0; n < 7; n++) {
      const mid = (lo + hi) / 2;
      if (inside(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  private wake() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    const dt = Math.min(1 / 30, (now - this.last) / 1000);
    this.last = now;
    this.gx.step(dt);
    this.gy.step(dt);
    const busy = this.render(now);
    if (busy || !this.gx.settled || !this.gy.settled)
      this.raf = requestAnimationFrame(this.tick);
  };

  /** Writes the current pose; returns whether a timed effect is still running. */
  private render(now: number): boolean {
    let busy = false;
    const { cx, bottom, w, h, ex, ey } = this.box;
    const gx = this.gx.value;
    const gy = this.gy.value;

    // Blink: eyes squash to a line and open again.
    let blinkScale = 1;
    this.blinks = this.blinks.filter(
      (start) => now - start < BLINK_CLOSE + BLINK_OPEN,
    );
    for (const start of this.blinks) {
      const t = now - start;
      if (t < 0) continue;
      const s =
        t < BLINK_CLOSE
          ? 1 - 0.92 * easeIn(t / BLINK_CLOSE)
          : 0.08 + 0.92 * easeOut((t - BLINK_CLOSE) / BLINK_OPEN);
      blinkScale = Math.min(blinkScale, s);
    }
    if (this.blinks.length) busy = true;

    // Expression crossfade.
    if (this.fade) {
      const t = clamp((now - this.fade.start) / FACE_FADE, 0, 1);
      for (const f of Object.keys(this.weights)) {
        const goal = f === this.fade.to ? 1 : 0;
        this.weights[f] =
          this.fade.from[f] + (goal - this.fade.from[f]) * easeOut(t);
      }
      for (const [f, el] of this.faceEls)
        el.setAttribute("opacity", this.weights[f].toFixed(3));
      if (t >= 1) this.fade = null;
      else busy = true;
    }

    // Hop: anticipate (squash), rise (stretch), land (squash), settle.
    let hopY = 0;
    let squash = 0;
    if (this.hopStart >= 0) {
      const p = (now - this.hopStart) / HOP;
      if (p >= 1) this.hopStart = -1;
      else {
        busy = true;
        if (p < 0.15) squash = 0.07 * Math.sin((p / 0.15) * Math.PI);
        else if (p < 0.8) {
          const q = (p - 0.15) / 0.65;
          hopY = -0.11 * h * 4 * q * (1 - q);
          squash = -0.05 * Math.sin(q * Math.PI);
        } else squash = 0.06 * Math.sin(((p - 0.8) / 0.2) * Math.PI);
      }
    }

    // Body: lean toward the gaze, drift a little, hop.
    const lean = gx * 5;
    const tx = gx * 0.02 * w;
    const ty = gy * 0.012 * h + hopY;
    this.bodyEl.setAttribute(
      "transform",
      `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${lean.toFixed(2)} ${cx} ${bottom}) translate(${cx} ${bottom}) scale(${(1 + squash).toFixed(4)} ${(1 - squash).toFixed(4)}) translate(${-cx} ${-bottom})`,
    );
    // Eyes: slide toward the gaze and foreshorten (a face turning), blink.
    const sx = 1 - 0.22 * Math.abs(gx);
    const sy = (1 - 0.14 * Math.abs(gy)) * blinkScale;
    const ox = gx * 0.15 * w;
    const oy = gy * 0.11 * h;
    const k = this.fit(ox, oy, sx, 1 - 0.14 * Math.abs(gy));
    this.eyesEl.setAttribute(
      "transform",
      `translate(${(k * ox).toFixed(2)} ${(k * oy).toFixed(2)}) translate(${ex} ${ey}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-ex} ${-ey})`,
    );
    return busy;
  }
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Direction from the bot's center to a point, scaled by how far counts as "all the way". */
function toward(
  el: Element,
  x: number,
  y: number,
  reach: { x: number; y: number },
): Vec {
  const r = el.getBoundingClientRect();
  return {
    x: (x - (r.left + r.width / 2)) / reach.x,
    y: (y - (r.top + r.height / 2)) / reach.y,
  };
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Starts a mode's behavior on a rig; returns its cleanup. */
function behave(
  rig: Rig,
  el: SVGSVGElement,
  mode: Mode,
  restFace: Face,
  endFace: Face,
): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const offs: (() => void)[] = [];
  const on = <K extends keyof WindowEventMap>(
    target: EventTarget,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
  ) => {
    target.addEventListener(type, fn as EventListener, { passive: true });
    offs.push(() => target.removeEventListener(type, fn as EventListener));
  };

  if (mode === "row") {
    // Like baby-sand's sidebar: on hover the bot looks at the pointer,
    // blinks, turns happy and hops; it settles back when the pointer leaves.
    const row = el.closest("[data-rig-hover]") ?? el;
    const reach = { x: 220, y: 90 };
    on(row, "pointerenter", () => {
      rig.blink();
      later(150, () => {
        rig.setFace(endFace);
        rig.hop();
      });
    });
    on(row, "pointermove", (e: PointerEvent) =>
      rig.lookAt(toward(el, e.clientX, e.clientY, reach)),
    );
    on(row, "pointerleave", () => {
      timers.forEach(clearTimeout);
      timers.clear();
      rig.setFace(restFace);
      rig.lookAt(null);
    });
    on(row, "focusin", () => {
      rig.blink();
      rig.setFace(endFace);
      rig.hop();
    });
    on(row, "focusout", () => rig.setFace(restFace));
  } else {
    // Headline and detail bots follow the pointer anywhere on the page and
    // blink on their own; the detail bot also glances around and now and
    // then cheers up when left alone.
    const reach = () => ({
      x: Math.max(360, innerWidth / 2),
      y: Math.max(280, innerHeight / 2),
    });
    let lastMove = 0;
    on(window, "pointermove", (e: PointerEvent) => {
      lastMove = performance.now();
      rig.lookAt(toward(el, e.clientX, e.clientY, reach()));
    });
    on(document.documentElement, "pointerleave", () => rig.lookAt(null));
    const blinkLoop = () => {
      rig.blink(Math.random() < 0.2 ? 2 : 1);
      later(rand(2400, 5200), blinkLoop);
    };
    later(rand(900, 2200), blinkLoop);
    if (mode === "detail") {
      let beat = 0;
      const idle = () => {
        if (performance.now() - lastMove > 2500) {
          beat++;
          if (beat % 4 === 0) {
            rig.setFace(endFace);
            rig.hop();
            later(1400, () => rig.setFace(restFace));
          } else {
            const a = rand(0, Math.PI * 2);
            rig.lookAt({
              x: Math.cos(a) * rand(0.4, 0.9),
              y: Math.sin(a) * rand(0.3, 0.7),
            });
            later(rand(800, 1500), () => rig.lookAt(null));
          }
        }
        later(rand(2200, 3800), idle);
      };
      later(1600, idle);
    }
  }
  return () => {
    for (const off of offs) off();
    for (const t of timers) clearTimeout(t);
  };
}

/**
 * An animated Grok Bot. `face` is the resting expression; hovering (rows) or
 * idle beats (detail) switch to happy, or surprised when it already rests
 * happy.
 */
export function BotRig({
  shape,
  color,
  face = "neutral",
  mode,
  rest = { x: 0.32, y: -0.2 },
  className = "",
  label,
  testId,
  outline = false,
}: {
  shape: RigShape;
  color: string;
  face?: Face;
  mode: Mode;
  rest?: Vec;
  className?: string;
  label?: string;
  testId?: string;
  /** Draw the body and eyes as strokes (`.bot-rig.is-outline` in CSS). */
  outline?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const endFace: Face = face === "happy" ? "surprised" : "happy";
  const faces: Face[] = face === endFace ? [face] : [face, endFace];
  const sprite = `/rig/${shape}.svg`;

  useEffect(() => {
    if (!svg.current || !bodyRef.current || !eyesRef.current) return;
    const faceEls = new Map<Face, SVGUseElement>();
    for (const el of svg.current.querySelectorAll<SVGUseElement>(
      "use[data-face]",
    )) {
      faceEls.set(el.dataset.face as Face, el);
    }
    const rig = new Rig(
      bodyRef.current,
      eyesRef.current,
      faceEls,
      shape,
      face,
      rest,
    );
    if (prefersReducedMotion()) return () => rig.destroy();
    const stop = behave(rig, svg.current, mode, face, endFace);
    return () => {
      stop();
      rig.destroy();
    };
  }, [shape, face, mode, endFace, rest.x, rest.y]);

  // A square viewBox around the body (with room to hop), so every shape
  // fills its box the same way.
  const [x0, y0, x1, y1] = metaFor(shape).body;
  const side = Math.max(x1 - x0, y1 - y0) * 1.1;
  const viewBox = `${((x0 + x1) / 2 - side / 2).toFixed(1)} ${((y0 + y1) / 2 - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`;
  const [light, dark] = inkForColor(color);
  return (
    <svg
      ref={svg}
      className={`bot-art bot-rig${outline ? " is-outline" : ""} ${className}`}
      viewBox={viewBox}
      overflow="visible"
      style={{ "--ink-light": light, "--ink-dark": dark } as CSSProperties}
      data-testid={testId}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      {label && <title>{label}</title>}
      <g ref={bodyRef}>
        <use
          href={`${sprite}#body`}
          x={0}
          y={0}
          width={1024}
          height={1024}
          fill="var(--ink)"
        />
        <g ref={eyesRef}>
          {faces.map((f) => (
            <use
              key={f}
              href={`${sprite}#eyes-${f}`}
              x={0}
              y={0}
              width={1024}
              height={1024}
              data-face={f}
              fill="var(--surface, var(--bg))"
              opacity={f === face ? 1 : 0}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
