import { ImageResponse } from "next/og";
import { colorFor, initials } from "@/components/member-avatar";
import { getCreatorProfile } from "@/data/creators";
import { listingCounts } from "@/lib/creator-handle";
import { botFaceUri, dataUri, OG_SIZE } from "@/lib/og";

export const alt = "A member's profile on Grok Bot Directory";
export const size = OG_SIZE;
export const contentType = "image/png";

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** X serves profile photos at 48px by default; ask for the 400px one. */
const larger = (src: string) =>
  src.replace(/_(normal|bigger|mini)(\.[a-z]+)$/i, "_400x400$2");

/**
 * The creator's photo as a data URI, or null: it lives on another host, so
 * it's fetched with a short wait and left out if that doesn't work.
 */
async function photo(src: string | null): Promise<string | null> {
  if (!src?.startsWith("https://")) return null;
  try {
    const res = await fetch(larger(src), { signal: AbortSignal.timeout(3000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(png|jpeg|gif)/.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 2_000_000) return null;
    return `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// The creator's photo and name, how much they have listed, and the faces of
// their bots (the brand tool's art, as on a bot's own preview).
export default async function Image({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profile = await getCreatorProfile(decodeURIComponent(handle));
  const lockup = await dataUri("brand/lockup-black.svg", "image/svg+xml");
  const creator = profile?.creator;
  const [avatar, faces] = await Promise.all([
    photo(creator?.image ?? null),
    Promise.all(
      (profile?.bots ?? [])
        .slice(0, 5)
        .map((bot) => botFaceUri(bot.body, bot.color)),
    ),
  ]);
  const name = creator?.name ?? "Profile not found";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#fff",
        padding: "56px 72px",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img */}
      <img src={lockup} height={34} alt="" style={{ width: 181 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        {avatar ? (
          // biome-ignore lint/performance/noImgElement: ImageResponse renders plain img
          <img
            src={avatar}
            width={200}
            height={200}
            alt=""
            style={{ borderRadius: 100, objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 100,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: colorFor(name),
              color: "#fff",
              fontSize: 76,
            }}
          >
            {initials(name)}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 64,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              color: "#0a0a0a",
            }}
          >
            {clip(name, 28)}
          </div>
          {profile && (
            <div style={{ marginTop: 16, fontSize: 30, color: "#525252" }}>
              {[
                creator?.xHandle && `@${creator.xHandle}`,
                listingCounts(profile.bots.length, profile.apps.length),
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          {faces.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              {faces.map((face) => (
                // biome-ignore lint/performance/noImgElement: ImageResponse renders plain img
                <img key={face} src={face} width={84} height={84} alt="" />
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 24, color: "#0a0a0a" }}>grok-bot.directory</div>
    </div>,
    size,
  );
}
