import type { Metadata } from "next";
import { SceneBot } from "@/components/bot-art";
import { CopyPrompt } from "@/components/copy-prompt";
import { SubmitForm } from "@/components/submit-form";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Submit a bot" };

type Props = { searchParams: Promise<{ link?: string }> };

export default async function SubmitPage({ searchParams }: Props) {
  const { link = "" } = await searchParams;
  const viewer = await requireViewer(
    link ? `/submit?link=${encodeURIComponent(link)}` : "/submit",
  );
  return (
    <div className="shell page submit-page">
      <h1 className="page-title">Submit a bot</h1>
      <p className="lede">Paste your bot’s share link.</p>
      <SubmitForm
        key={link}
        viewerName={viewer.name}
        viewerImage={viewer.image}
        initialLink={link}
      />
      <section className="share-howto" aria-labelledby="share-howto-title">
        <h2 id="share-howto-title">Ask your bot for a share link</h2>
        {/* A tiny Grok Bot chat, styled like the app's bubbles. */}
        <div className="mini-chat">
          <div className="mc-row mc-user">
            <CopyPrompt prompt="Share yourself as a public template" />
          </div>
          <div className="mc-row mc-bot">
            <SceneBot
              body="blob"
              color="black"
              face="happy"
              className="mc-avatar"
              testId="howto-bot"
            />
            <p className="mc-bubble">
              Done. Here’s my link: <span className="mc-link">x.ai/bot/…</span>
            </p>
          </div>
        </div>
        <p className="share-howto-alt">
          Or open its settings, click <b>Share as Template</b>, choose{" "}
          <b>Public</b>, then <b>Publish</b> and <b>Copy Link</b>.
        </p>
      </section>
    </div>
  );
}
