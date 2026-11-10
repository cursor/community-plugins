import Link from "next/link";
import { isAdmin, type Viewer } from "@/lib/auth";
import { MobileMenu, SignInLink, UserMenu } from "./header-menus";
import { Lockup } from "./theme";

export const GUIDES_URL = "https://x.ai/bot/guides";

export async function Header({ viewer }: { viewer: Viewer | null }) {
  const admin = viewer ? await isAdmin(viewer.id).catch(() => false) : false;
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
          <Link href="/">Bots</Link>
          <Link href="/?tab=apps">Apps</Link>
          <a href={GUIDES_URL} target="_blank" rel="noopener noreferrer">
            Guides
          </a>
        </nav>
        <div className="header-actions">
          {viewer ? (
            <UserMenu name={viewer.name} image={viewer.image} admin={admin} />
          ) : (
            <SignInLink />
          )}
        </div>
        <MobileMenu signedIn={!!viewer} admin={admin} />
      </div>
    </header>
  );
}
