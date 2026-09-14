"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const columns = [
  {
    title: "Explore",
    links: [
      { href: "/", label: "Plugins" },
      { href: "/bots", label: "Bots" },
      { href: "/plugins/new", label: "Submit a Plugin" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "/members", label: "Members" },
      { href: "/members/companies", label: "Companies" },
    ],
  },
  {
    title: "Resources",
    links: [
      {
        href: "https://cursor.com/learn?utm_source=cursor-directory&utm_medium=referral&utm_campaign=footer",
        label: "Learn Cursor",
        external: true,
      },
      {
        href: "https://cursor.com/changelog",
        label: "Changelog",
        external: true,
      },
      {
        href: "https://docs.cursor.com",
        label: "Documentation",
        external: true,
      },
      {
        href: "https://cursor.com/blog",
        label: "Blog",
        external: true,
      },
    ],
  },
  {
    title: "Contribute",
    links: [
      { href: "/plugins/new", label: "Submit a Plugin" },
      { href: "/bots/new", label: "Submit a Bot" },
      {
        href: "https://github.com/cursor/community-plugins",
        label: "GitHub",
        external: true,
      },
    ],
  },
] as const;

const socials = [
  {
    href: "https://x.com/cursor_ai",
    label: "X",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    href: "https://github.com/cursor/community-plugins",
    label: "GitHub",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    ),
  },
];

function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isActive = (value: string) => mounted && theme === value;

  return (
    <div className="flex items-center gap-1 rounded-full border border-border p-1">
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={`rounded-full p-1.5 transition-colors ${isActive("light") ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        aria-label="Light theme"
      >
        <Sun className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={`rounded-full p-1.5 transition-colors ${isActive("dark") ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        aria-label="Dark theme"
      >
        <Moon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("system")}
        className={`rounded-full p-1.5 transition-colors ${isActive("system") ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        aria-label="System theme"
      >
        <Monitor className="size-3.5" />
      </button>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-[1300px] px-4 py-16 md:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="mb-4 text-sm font-medium text-foreground">
                {column.title}
              </h3>
              <ul className="space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-border pt-8 md:flex-row">
          <div className="flex items-center">
            <img
              src="/logo-lockup.svg"
              alt="Cursor Directory"
              className="h-[18px] w-auto opacity-40 dark:brightness-100 brightness-0"
            />
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            {socials.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
