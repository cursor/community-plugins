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
  /** Makes the option a link (replacing the URL); otherwise a button. */
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
  inPlace = false,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (id: T) => void;
  label: string;
  style?: CSSProperties;
  /**
   * Link options rewrite the URL where the page stands instead of
   * navigating: for a page that already holds what every option shows and
   * reads the choice from the URL, so nothing is requested again.
   */
  inPlace?: boolean;
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
            onClick={(e) => {
              // A modified click (new tab, new window) is left to the link.
              const plain =
                e.button === 0 &&
                !e.metaKey &&
                !e.ctrlKey &&
                !e.shiftKey &&
                !e.altKey;
              if (inPlace && plain) {
                e.preventDefault();
                window.history.replaceState(null, "", href);
              }
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
