import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BotForm } from "@/components/forms/bot-form";
import { getSession } from "@/utils/supabase/auth";

export const metadata: Metadata = {
  title: "Submit a Bot | Cursor Directory",
  description:
    "Submit a bot use case to Cursor Directory. Paste a GitHub repo with bot.json or BOT.md.",
  openGraph: {
    title: "Submit a Bot | Cursor Directory",
    description:
      "Submit a bot use case to Cursor Directory. Paste a GitHub repo with bot.json or BOT.md.",
  },
  twitter: {
    title: "Submit a Bot | Cursor Directory",
    description:
      "Submit a bot use case to Cursor Directory. Paste a GitHub repo with bot.json or BOT.md.",
  },
};

async function NewBotGate() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/bots/new");
  }

  return <BotForm />;
}

export default function Page() {
  return (
    <div className="min-h-screen px-6 pt-24 md:pt-32 pb-32">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-10 text-center">
          <h1 className="marketing-page-title mb-3">Submit a Bot</h1>
          <p className="marketing-copy mx-auto max-w-md">
            Paste a GitHub repo. We look for bot.json or BOT.md plus a use-case
            writeup. Open Plugins agents/*.md files belong on{" "}
            <a
              href="/plugins/new"
              className="text-foreground border-b border-border border-dashed"
            >
              plugin submit
            </a>
            .
          </p>
        </div>

        <Suspense fallback={null}>
          <NewBotGate />
        </Suspense>
      </div>
    </div>
  );
}
