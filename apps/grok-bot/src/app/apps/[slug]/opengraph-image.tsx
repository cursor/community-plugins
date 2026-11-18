import { ImageResponse } from "next/og";
import { colorFor, initials } from "@/components/member-avatar";
import { getApp } from "@/data/apps";
import { appCategoryLabel, primaryAppCategory } from "@/lib/app-categories";
import { dataUri, OG_SIZE } from "@/lib/og";

export const alt = "An app for Grok Bot on Grok Bot Directory";
export const size = OG_SIZE;
export const contentType = "image/png";

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

// The image renderer only draws PNG and JPEG reliably, and a slow logo host
// mustn't hold up the card; anything else falls back to initials.
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

// The app's logo with its card.
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const app = await getApp((await params).slug);
  const lockup = await dataUri("brand/lockup-black.svg", "image/svg+xml");
  const logo = await logoUri(app?.logo ?? null);
  const name = app?.name ?? "App not found";
  const category = app ? primaryAppCategory(app.categories) : null;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#fff",
        padding: "56px 72px",
        alignItems: "center",
        gap: 72,
      }}
    >
      <div
        style={{
          width: 320,
          height: 320,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 72,
          overflow: "hidden",
          background: logo ? "#f0f0f0" : colorFor(name),
          color: "#fff",
          fontSize: 120,
        }}
      >
        {logo ? (
          // biome-ignore lint/performance/noImgElement: ImageResponse renders plain img
          <img src={logo} width={320} height={320} alt="" />
        ) : (
          initials(name)
        )}
      </div>
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
            {clip(name, 40)}
          </div>
          {app && (
            <div
              style={{
                marginTop: 20,
                fontSize: 28,
                lineHeight: 1.4,
                color: "#525252",
              }}
            >
              {clip(app.description, 150)}
            </div>
          )}
          {app && (
            <div style={{ marginTop: 24, fontSize: 24, color: "#737373" }}>
              {[
                app.publisher && `by ${app.publisher}`,
                app.marketplaceId ? "Official app" : "Community app",
                category && appCategoryLabel(category),
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>
        <div style={{ fontSize: 24, color: "#0a0a0a" }}>grok-bot.directory</div>
      </div>
    </div>,
    size,
  );
}
