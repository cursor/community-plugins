import type { Metadata } from "next";
import Link from "next/link";
import { UPDATES, updateDate } from "@/lib/whats-new";

const DESCRIPTION =
  "What has changed on Grok Bot Directory for people who list bots and apps.";

export const metadata: Metadata = {
  title: "What’s new",
  description: DESCRIPTION,
  alternates: { canonical: "/whats-new" },
};

/** Every update, newest first, under the day it shipped. */
export default function WhatsNewPage() {
  const days = [...new Set(UPDATES.map((u) => u.date))];
  return (
    <div className="shell page whats-new-page" data-testid="whats-new-page">
      <h1 className="page-title">What’s new</h1>
      <p className="lede">Changes to the directory for people who list here.</p>
      {days.map((day) => (
        <section key={day}>
          <h2>
            <time dateTime={day}>{updateDate(day)}</time>
          </h2>
          {UPDATES.filter((u) => u.date === day).map((update) => (
            <article key={update.id} id={update.id}>
              <h3>{update.title}</h3>
              <p>{update.body}</p>
              {update.link && (
                <Link href={update.link.href}>{update.link.label} ›</Link>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
