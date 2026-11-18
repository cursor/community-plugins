import { ImageResponse } from "next/og";
import { getListedBot } from "@/data/bots";
import { categoryLabel } from "@/lib/categories";
import { botFaceUri, dataUri, OG_SIZE } from "@/lib/og";

export const alt = "A Grok Bot on Grok Bot Directory";
export const size = OG_SIZE;
export const contentType = "image/png";

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

// The bot's official face (brand-tool art) in its own color, with its card.
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const bot = await getListedBot((await params).slug);
  const lockup = await dataUri("brand/lockup-black.svg", "image/svg+xml");
  const face = bot
    ? await botFaceUri(bot.body, bot.color)
    : await botFaceUri("blob", "black", "neutral");
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#fff",
        padding: "56px 72px",
        alignItems: "center",
        gap: 56,
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img */}
      <img
        src={face}
        width={420}
        height={420}
        alt=""
        style={{ flexShrink: 0, transform: "scale(1.2)" }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          flex: 1,
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img */}
        <img src={lockup} height={34} alt="" style={{ width: 181 }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 64,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              color: "#0a0a0a",
            }}
          >
            {bot ? clip(bot.name, 40) : "Bot not found"}
          </div>
          {bot && (
            <div
              style={{
                marginTop: 20,
                fontSize: 28,
                lineHeight: 1.4,
                color: "#525252",
              }}
            >
              {clip(bot.description, 150)}
            </div>
          )}
          {bot && (
            <div style={{ marginTop: 24, fontSize: 24, color: "#737373" }}>
              {`by ${bot.creator.name} · ${categoryLabel(bot.category)}`}
            </div>
          )}
        </div>
        <div style={{ fontSize: 24, color: "#0a0a0a" }}>grok-bot.directory</div>
      </div>
    </div>,
    size,
  );
}
