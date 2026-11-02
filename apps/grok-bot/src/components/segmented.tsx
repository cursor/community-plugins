"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type SegmentedOption<T extends string> = {
  id: T;
  label: ReactNode;
  /** Makes the option a link (replace navigation); otherwise a button. */
  href?: string;
};

/**
 * A pill toggle whose highlight slides between options. Link options move
 * the highlight on click, before the new page arrives; before hydration the
 * active option keeps its own `.on` background, so the first paint matches.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (id: T) => void;
  label: string;
  style?: CSSProperties;
}) {
  const [active, setActive] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setActive(value);
  }

  const root = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector<HTMLElement>(`[data-seg="${active}"]`);
      if (on) setThumb({ x: on.offsetLeft, w: on.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => ro.disconnect();
  }, [active]);

  // Place the highlight without a slide, then animate later moves.
  useEffect(() => {
    if (!thumb || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [thumb, animate]);

  return (
    <div
      ref={root}
      className="seg"
      role="tablist"
      aria-label={label}
      data-ready={thumb ? "true" : undefined}
      data-animate={animate ? "true" : undefined}
      style={style}
    >
      {thumb && (
        <span
          className="seg-thumb"
          aria-hidden="true"
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
        />
      )}
      {options.map(({ id, label: text, href }) => {
        const props = {
          role: "tab",
          "aria-selected": active === id,
          className: active === id ? "on" : "",
          "data-seg": id,
        } as const;
        return href ? (
          <Link
            key={id}
            href={href}
            replace
            {...props}
            onClick={() => {
              setActive(id);
              onChange?.(id);
            }}
          >
            {text}
          </Link>
        ) : (
          <button
            key={id}
            type="button"
            {...props}
            onClick={() => {
              setActive(id);
              onChange?.(id);
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
