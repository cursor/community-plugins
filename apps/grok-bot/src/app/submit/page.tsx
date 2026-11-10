import type { Metadata } from "next";
import { AppSubmitForm } from "@/components/app-submit-form";
import { SceneBot } from "@/components/bot-art";
import { CopyPrompt } from "@/components/copy-prompt";
import { Segmented } from "@/components/segmented";
import { SubmitForm } from "@/components/submit-form";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Submit" };

const OFFICIAL_SUBMIT_URL = "https://x.ai/bot/marketplace/submit-a-plugin";

type Props = { searchParams: Promise<{ link?: string; kind?: string }> };

export default async function SubmitPage({ searchParams }: Props) {
  const { link = "", kind } = await searchParams;
  const app = kind === "app";
  const viewer = await requireViewer(
    app
      ? "/submit?kind=app"
      : link
        ? `/submit?link=${encodeURIComponent(link)}`
        : "/submit",
  );
  return (
    <div className="shell page submit-page">
      <div className="submit-kind">
        <Segmented
          label="What to submit"
          value={app ? "app" : "bot"}
          options={[
            { id: "bot", label: "Bot", href: "/submit" },
            { id: "app", label: "App", href: "/submit?kind=app" },
          ]}
        />
      </div>
      {app ? (
        <>
          <h1 className="page-title">Submit an app</h1>
          <p className="lede">
            Share an MCP server or skills your bots can use. Every app gets a
            security check before it’s listed, here and on cursor.directory.
          </p>
          <AppSubmitForm />
          <section className="share-howto" aria-labelledby="official-title">
            <h2 id="official-title">Want one-click install?</h2>
            <p className="share-howto-alt">
              Apps in the official marketplace install in Grok Bot with one
              click.{" "}
              <a
                href={OFFICIAL_SUBMIT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Submit it to the marketplace
              </a>{" "}
              too; once it’s approved, its listing here becomes official.
            </p>
          </section>
        </>
      ) : (
        <>
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
                  Done. Here’s my link:{" "}
                  <span className="mc-link">x.ai/bot/…</span>
                </p>
              </div>
            </div>
            <p className="share-howto-alt">
              Or open its settings, click <b>Share as Template</b>, choose{" "}
              <b>Public</b>, then <b>Publish</b> and <b>Copy Link</b>.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
