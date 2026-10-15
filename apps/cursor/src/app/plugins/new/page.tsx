import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PluginForm } from "@/components/forms/plugin-form";
import { getSession } from "@/utils/supabase/auth";

export const metadata: Metadata = {
  title: "Submit a Plugin | Cursor Directory",
  description:
    "Submit a plugin to Cursor Directory and reach 300k+ developers.",
  openGraph: {
    title: "Submit a Plugin | Cursor Directory",
    description:
      "Submit a plugin to Cursor Directory and reach 300k+ developers.",
  },
  twitter: {
    title: "Submit a Plugin | Cursor Directory",
    description:
      "Submit a plugin to Cursor Directory and reach 300k+ developers.",
  },
};

/**
 * The auth gate reads the session (runtime API), so it streams inside
 * Suspense. The marketing copy above stays in the static shell, which also
 * means link prefetches of this page no longer invoke a function.
 */
async function NewPluginGate() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/plugins/new");
  }

  return <PluginForm />;
}

export default function Page() {
  return (
    <div className="min-h-screen px-6 pt-24 md:pt-32 pb-32">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-10 text-center">
          <h1 className="marketing-page-title mb-3">Submit a Plugin</h1>
          <p className="marketing-copy mx-auto max-w-md">
            Auto-detect from a GitHub repo or create one manually.
            <br />
            We follow the{" "}
            <a
              href="https://agent-plugins.org"
              target="_blank"
              rel="noreferrer"
              className="text-foreground border-b border-border border-dashed"
            >
              Open Plugins
            </a>{" "}
            standard.
          </p>
        </div>

        <Suspense fallback={null}>
          <NewPluginGate />
        </Suspense>
      </div>
    </div>
  );
}
