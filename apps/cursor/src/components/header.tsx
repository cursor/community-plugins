"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { MobileMenu } from "./mobile-menu";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { UserMenu } from "./user-menu";

export const navigationLinks = [
  {
    href: "/",
    label: "Plugins",
    match: (p: string) => p === "/" || p.startsWith("/plugins"),
  },
  {
    href: "/bots",
    label: "Bots",
    match: (p: string) => p === "/bots" || p.startsWith("/bots/"),
  },
  {
    href: "/members",
    label: "Members",
    match: (p: string) => p === "/members" || p.startsWith("/members/"),
  },
] as const;

/**
 * Nav links, optionally highlighted for the active route. `usePathname` is
 * runtime data under Cache Components (unknown during the prerender of
 * dynamic routes), so the pathname-aware variant renders behind <Suspense>
 * and this list doubles as its pathname-agnostic fallback.
 */
function NavLinksList({ pathname }: { pathname: string | null }) {
  return (
    <>
      {navigationLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "chrome-label rounded-full px-3.5 py-2 font-medium transition-colors",
            pathname !== null && link.match(pathname)
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}

function ActiveNavLinks() {
  const pathname = usePathname();
  return <NavLinksList pathname={pathname} />;
}

export function Header() {
  return (
    <div className="relative z-30 flex items-center justify-between">
      <div className="fixed inset-x-0 top-0 z-50 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[56px] w-full max-w-[1300px] items-center justify-between px-4 text-[15px] md:h-[60px] md:px-6">
          <Link href="/" className="flex items-center text-foreground">
            <img
              src="/logo-lockup.svg"
              alt="Cursor Directory"
              className="h-[18px] w-auto dark:brightness-100 brightness-0"
            />
          </Link>

          <Suspense fallback={null}>
            <MobileMenu />
          </Suspense>

          <div className="hidden items-center gap-2 md:flex">
            <Suspense fallback={<NavLinksList pathname={null} />}>
              <ActiveNavLinks />
            </Suspense>

            <Link href="/plugins/new">
              <Button variant="default" className="h-8 rounded-full px-4">
                Submit a plugin
              </Button>
            </Link>

            <div className="flex min-w-[88px] items-center justify-end">
              {/* Fallback matches UserMenu's own loading skeleton so the
                  static shell shows the same placeholder instead of a gap. */}
              <Suspense fallback={<Skeleton className="size-6 rounded-none" />}>
                <UserMenu />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
