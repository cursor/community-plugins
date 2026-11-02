import Link from "next/link";
import { Lockup, ThemeToggle } from "./theme";

const COLUMNS: [string, [href: string, label: string][]][] = [
  [
    "Directory",
    [
      ["/", "Bots"],
      ["/submit", "Submit a bot"],
      ["/my-bots", "Your bots"],
    ],
  ],
  [
    "Grok Bot",
    [
      ["https://x.ai/bot", "Overview"],
      ["https://x.ai/bot/marketplace", "Marketplace"],
      ["https://x.ai/bot/guides", "Guides"],
      ["https://x.ai/bot/use-cases", "Use cases"],
    ],
  ],
  [
    "Community",
    [
      ["https://cursor.directory", "cursor.directory"],
      ["https://github.com/cursor/community-plugins", "GitHub"],
    ],
  ],
];

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div>
            <Lockup className="logo" />
            <small>Community bots for Grok Bot</small>
          </div>
          <ThemeToggle />
        </div>
        <div className="cols">
          {COLUMNS.map(([title, links]) => (
            <div key={title}>
              <h3>{title}</h3>
              <ul>
                {links.map(([href, label]) => (
                  <li key={label}>
                    {href.startsWith("http") ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {label}
                      </a>
                    ) : (
                      <Link href={href}>{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
