import Link from "next/link";
import { BotArt } from "@/components/bot-art";

export default function NotFound() {
  return (
    <div className="shell page">
      <div className="empty">
        <BotArt
          body="blob"
          color="black"
          face="confused"
          className="empty-bot"
        />
        <p>This page doesn’t exist, or the bot isn’t listed.</p>
        <Link href="/" className="btn btn-gray">
          Back to all bots
        </Link>
      </div>
    </div>
  );
}
