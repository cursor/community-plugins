import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BotDetailView } from "@/components/bots/bot-detail";
import { getBotBySlug, getBots } from "@/data/queries";
import { SEED_BOT_SLUG } from "@/lib/bots/seed";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const { data: bot } = await getBotBySlug(slug);

  if (bot?.active) {
    const title = `${bot.name} | Cursor Directory`;
    const description = bot.description;
    return {
      title,
      description,
      openGraph: { title, description },
      twitter: { title, description },
    };
  }

  if (bot && !bot.active) {
    return {
      title: `${bot.name} | Cursor Directory`,
      robots: { index: false },
    };
  }

  return { title: "Bot Not Found" };
}

export async function generateStaticParams() {
  const { data: bots } = await getBots({ fetchAll: true });
  const slugs = new Set((bots ?? []).map((bot) => bot.slug));
  slugs.add(SEED_BOT_SLUG);
  return [...slugs].map((slug) => ({ slug }));
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const { data: bot } = await getBotBySlug(slug);
  if (!bot) notFound();
  return <BotDetailView bot={bot} />;
}
