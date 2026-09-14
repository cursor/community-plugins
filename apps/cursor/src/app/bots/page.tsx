import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { BotList } from "@/components/bots/bot-list";
import { Button } from "@/components/ui/button";
import { getBots } from "@/data/queries";

export const metadata: Metadata = {
  title: "Bots",
  description:
    "Copyable Cursor bot templates composed with the plugins and skills they need. Use-case pages from the community.",
  openGraph: {
    title: "Bots | Cursor Directory",
    description:
      "Copyable Cursor bot templates composed with the plugins and skills they need.",
  },
  twitter: {
    title: "Bots | Cursor Directory",
    description:
      "Copyable Cursor bot templates composed with the plugins and skills they need.",
  },
};

export default async function Page() {
  "use cache";
  cacheLife("hours");
  cacheTag("bots");

  const { data: bots } = await getBots({ fetchAll: true });

  return (
    <div className="page-shell min-h-screen pb-32 pt-24 md:pt-32">
      <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="marketing-page-title">Bots</h1>
          <p className="marketing-copy max-w-2xl">
            Use-case pages. Each one is a copyable bot template, the plugins and
            skills it needs, and a writeup you can rank for search.
          </p>
        </div>
        <Link href="/bots/new">
          <Button variant="default" className="h-8 rounded-full px-4">
            Submit a bot
          </Button>
        </Link>
      </div>
      <BotList bots={bots ?? []} />
    </div>
  );
}
