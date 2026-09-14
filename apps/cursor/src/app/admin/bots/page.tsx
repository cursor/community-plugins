import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getPendingBots } from "@/data/queries";
import { isAdmin } from "@/utils/admin";
import { getSession } from "@/utils/supabase/auth";
import { BotReviewList } from "./bot-review-list";

export const metadata: Metadata = {
  title: "Review Bots | Admin",
};

async function AdminBotsContent() {
  const session = await getSession();

  if (!session || !isAdmin(session.user.id)) {
    redirect("/");
  }

  const { data: pending } = await getPendingBots();

  return <BotReviewList bots={pending ?? []} />;
}

export default function AdminBotsPage() {
  return (
    <div className="min-h-screen px-6 pt-24 md:pt-32 pb-32">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-10">
          <h1 className="marketing-page-title mb-3">Review Bots</h1>
          <p className="marketing-copy text-muted-foreground">
            Bot submissions land here unpublished. Scan is stubbed. Approve to
            list the use case on /bots.
          </p>
        </div>
        <Suspense fallback={null}>
          <AdminBotsContent />
        </Suspense>
      </div>
    </div>
  );
}
