import { ImageResponse } from "next/og";
import { dataUri, OG_SIZE } from "@/lib/og";

export const alt = "Grok Bot Directory: find a bot for every job";
export const size = OG_SIZE;
export const contentType = "image/png";

// The backdrop is a brand-tool Bot composition (grok-bot-scatter, clear
// space on the left) in public/og/home-scatter.png.
export default async function Image() {
  const [backdrop, lockup] = await Promise.all([
    dataUri("og/home-scatter.png", "image/png"),
    dataUri("brand/lockup-black.svg", "image/svg+xml"),
  ]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: "#fff",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img */}
      <img
        src={backdrop}
        width={1200}
        height={630}
        alt=""
        style={{ position: "absolute", inset: 0 }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 600,
          height: "100%",
          padding: "64px 0 56px 72px",
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img */}
        <img src={lockup} height={40} alt="" style={{ width: 213 }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 76,
              lineHeight: 1.02,
              letterSpacing: -2,
              color: "#0a0a0a",
            }}
          >
            Find a bot for every job
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 30,
              lineHeight: 1.35,
              color: "#737373",
            }}
          >
            Community-built Grok Bots, ranked by what’s trending.
          </div>
        </div>
        <div style={{ fontSize: 26, color: "#0a0a0a" }}>grok-bot.directory</div>
      </div>
    </div>,
    size,
  );
}
