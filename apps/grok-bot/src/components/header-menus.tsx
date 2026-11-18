"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
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

/**
 * Switches the home page's tab where the page stands when a link to it is
 * clicked on the home page, which already holds both tabs (home-directory.tsx);
 * anywhere else, and for a click that opens a new tab, the link navigates.
 */
function switchTabInPlace(
  e: MouseEvent<HTMLAnchorElement>,
  pathname: string,
  href: string,
): boolean {
  const plain =
    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  if (pathname !== "/" || !plain) return false;
  e.preventDefault();
  window.history.pushState(null, "", href);
  return true;
}

/** A header link to the home page's Bots or Apps tab. */
export function TabLink({
  href,
  children,
}: {
  href: "/" | "/?tab=apps";
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <Link href={href} onClick={(e) => switchTabInPlace(e, pathname, href)}>
      {children}
    </Link>
  );
}

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

/** Who is signed in. A name that is already the email isn't said twice. */
function Who({ name, account }: { name: string; account: string | null }) {
  return (
    <>
      <span className="who-name">{name}</span>
      {account && account !== name && (
        <span className="who-account">{account}</span>
      )}
    </>
  );
}

export function UserMenu({
  name,
  account,
  image,
  admin,
  profile,
}: {
  name: string;
  account: string | null;
  image: string | null;
  admin: boolean;
  /** The member's public profile, when they have one. */
  profile: string | null;
}) {
  // Each item's place in the menu, for the staggered entrance.
  let place = 0;
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
        <div className="menu-who" data-testid="menu-who" style={nth(place++)}>
          <Who name={name} account={account} />
        </div>
        {profile && (
          <Link
            href={profile}
            role="menuitem"
            data-testid="menu-profile"
            style={nth(place++)}
          >
            Your profile
          </Link>
        )}
        <Link href="/my-bots" role="menuitem" style={nth(place++)}>
          Your submissions
        </Link>
        {admin && (
          <Link href="/admin" role="menuitem" style={nth(place++)}>
            Admin
          </Link>
        )}
        <SignOutButton style={nth(place++)} />
      </div>
    </div>
  );
}

export function MobileMenu({
  viewer,
  admin,
  profile,
}: {
  /** The signed-in member, or null. */
  viewer: { name: string; account: string | null } | null;
  admin: boolean;
  /** The member's public profile, when they have one. */
  profile: string | null;
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
          {(
            [
              ["/", "Bots"],
              ["/?tab=apps", "Apps"],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              onClick={(e) => {
                // The page doesn't change, so nothing else closes the menu.
                if (switchTabInPlace(e, pathname, href)) setOpen(false);
              }}
            >
              {label}
            </Link>
          ))}
          <a href={GUIDES_URL} target="_blank" rel="noopener noreferrer">
            Guides
          </a>
          {profile && (
            <Link href={profile} data-testid="mobile-profile">
              Your profile
            </Link>
          )}
          {viewer ? (
            <Link href="/my-bots">Your submissions</Link>
          ) : (
            pathname !== "/login" && <Link href="/login">Sign in</Link>
          )}
          {admin && <Link href="/admin">Admin</Link>}
          {viewer && (
            <div className="mobile-who" data-testid="mobile-who">
              <span className="who">
                <Who name={viewer.name} account={viewer.account} />
              </span>
              <form action="/auth/sign-out" method="post">
                <button type="submit">Sign out</button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
