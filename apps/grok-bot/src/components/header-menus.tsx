"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { MemberAvatar } from "./member-avatar";

const GUIDES_URL = "https://x.ai/bot/guides";

function SignOutButton({ style }: { style?: CSSProperties }) {
  return (
    <form action="/auth/sign-out" method="post">
      <button type="submit" role="menuitem" style={style}>
        Sign out
      </button>
    </form>
  );
}

/** Position in the menu, for the staggered entrance (`--i` in CSS). */
const nth = (i: number) => ({ "--i": i }) as CSSProperties;

/** Hidden on the sign-in page itself. */
export function SignInLink() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <Link href="/login" className="btn btn-gray">
      Sign in
    </Link>
  );
}

export function UserMenu({
  name,
  image,
  admin,
}: {
  name: string;
  image: string | null;
  admin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="avatar-link"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MemberAvatar name={name} image={image} size={30} />
      </button>
      {/* Always rendered so closing can animate; inert while closed. */}
      <div
        className="menu"
        role="menu"
        data-open={open}
        inert={!open}
        aria-hidden={!open}
      >
        <Link href="/my-bots" role="menuitem" style={nth(0)}>
          Your bots
        </Link>
        {admin && (
          <Link href="/admin" role="menuitem" style={nth(1)}>
            Admin
          </Link>
        )}
        <SignOutButton style={nth(admin ? 2 : 1)} />
      </div>
    </div>
  );
}

export function MobileMenu({
  signedIn,
  admin,
}: {
  signedIn: boolean;
  admin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button
        type="button"
        className="mobile-toggle"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <path d="M18 6 6 18M6 6l12 12" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>
      {open && (
        <div className="mobile-menu">
          <Link href="/">Bots</Link>
          <a href={GUIDES_URL} target="_blank" rel="noopener noreferrer">
            Guides
          </a>
          {signedIn ? (
            <Link href="/my-bots">Your bots</Link>
          ) : (
            pathname !== "/login" && <Link href="/login">Sign in</Link>
          )}
          {admin && <Link href="/admin">Admin</Link>}
        </div>
      )}
    </>
  );
}
