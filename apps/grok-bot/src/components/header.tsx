import Link from "next/link";
import { ownProfilePath } from "@/data/creators";
import { isAdmin, type Viewer } from "@/lib/auth";
import { MobileMenu, SignInLink, TabLink, UserMenu } from "./header-menus";
import { Lockup } from "./theme";

export const GUIDES_URL = "https://x.ai/bot/guides";

export async function Header({ viewer }: { viewer: Viewer | null }) {
  // The member's own profile, once they have something listed.
  const [admin, profile] = viewer
    ? await Promise.all([
        isAdmin(viewer.id).catch(() => false),
        ownProfilePath(viewer.id).catch(() => null),
      ])
    : [false, null];
  return (
    <header className="header">
      <div className="header-inner">
        <Link
          href="/"
          className="logo-link"
          aria-label="Grok Bot Directory home"
        >
          <Lockup className="logo" />
          <span className="logo-sub">Directory</span>
        </Link>
        <nav className="nav">
          <TabLink href="/">Bots</TabLink>
          <TabLink href="/?tab=apps">Apps</TabLink>
          <a href={GUIDES_URL} target="_blank" rel="noopener noreferrer">
            Guides
          </a>
        </nav>
        <div className="header-actions">
          {viewer ? (
            <UserMenu
              name={viewer.name}
              account={viewer.account}
              image={viewer.image}
              admin={admin}
              profile={profile}
            />
          ) : (
            <SignInLink />
          )}
        </div>
        <MobileMenu
          viewer={viewer && { name: viewer.name, account: viewer.account }}
          admin={admin}
          profile={profile}
        />
      </div>
    </header>
  );
}
