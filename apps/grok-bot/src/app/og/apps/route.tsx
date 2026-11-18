import { ImageResponse } from "next/og";
import { dataUri, OG_SIZE } from "@/lib/og";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

// The link preview for the Apps tab (/?tab=apps). The home page and the tab
// are one route, so the tab can't have an opengraph-image file of its own;
// the page's metadata points here instead.
//
// It shows the logos of well-known official apps (ones that read on a light
// tile). If too few of them load, it falls back to the home card's backdrop,
// so the image is never half empty.
const SHOWN = [
  "Notion",
  "Figma",
  "Linear",
  "Slack",
  "GitHub",
  "Stripe",
  "Vercel",
  "Supabase",
  "Datadog",
  "Canva",
  "Atlassian",
  "Cloudflare",
  "PostHog",
];
const TILES = 9;

// The image renderer only draws PNG and JPEG reliably, and a slow logo host
// mustn't hold up the card.
async function logoUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(png|jpeg)/.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

async function logos(): Promise<string[]> {
  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("plugins")
      .select("name, logo")
      .eq("active", true)
      .not("marketplace_plugin_id", "is", null)
      .in("name", SHOWN);
    const byName = new Map((data ?? []).map((p) => [p.name, p.logo]));
    const loaded = await Promise.all(
      SHOWN.map((name) => logoUri(byName.get(name) ?? null)),
    );
    return loaded.filter((uri): uri is string => uri !== null).slice(0, TILES);
  } catch {
    return [];
  }
}

export async function GET() {
  const [lockup, tiles] = await Promise.all([
    dataUri("brand/lockup-black.svg", "image/svg+xml"),
    logos(),
  ]);
  const backdrop =
    tiles.length < TILES
      ? await dataUri("og/home-scatter.png", "image/png")
      : null;
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
      {backdrop && (
        // biome-ignore lint/performance/noImgElement: ImageResponse renders plain img
        <img
          src={backdrop}
          width={1200}
          height={630}
          alt=""
          style={{ position: "absolute", inset: 0 }}
        />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 620,
          height: "100%",
          padding: "64px 0 56px 72px",
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img */}
        <img src={lockup} height={40} alt="" style={{ width: 213 }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              lineHeight: 1.04,
              letterSpacing: -2,
              color: "#0a0a0a",
            }}
          >
            Tools and skills for your bots
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 30,
              lineHeight: 1.35,
              color: "#737373",
            }}
          >
            Official and community apps.
          </div>
        </div>
        <div style={{ fontSize: 26, color: "#0a0a0a" }}>grok-bot.directory</div>
      </div>
      {!backdrop && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignContent: "center",
            gap: 24,
            width: 498,
            height: "100%",
            marginLeft: 10,
          }}
        >
          {tiles.map((src) => (
            <div
              key={src.slice(-32)}
              style={{
                display: "flex",
                width: 150,
                height: 150,
                borderRadius: 34,
                overflow: "hidden",
                background: "#f0f0f0",
              }}
            >
              {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img */}
              <img src={src} width={150} height={150} alt="" />
            </div>
          ))}
        </div>
      )}
    </div>,
    {
      ...OG_SIZE,
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
