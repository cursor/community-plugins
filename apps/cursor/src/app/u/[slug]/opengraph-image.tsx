import { cacheLife, cacheTag } from "next/cache";
import { getUserProfile } from "@/data/queries";
import { loadOgImage, OG, OGLayout, ogResponse, renderOGBytes } from "@/lib/og";

export const alt = "User Profile";
export const size = { width: OG.width, height: OG.height };
export const contentType = "image/png";

async function renderImage(slug: string) {
  "use cache";
  cacheLife("days");
  cacheTag("users", `user-${slug}`);

  const { data } = await getUserProfile(slug);

  if (!data) {
    return renderOGBytes(
      <OGLayout>
        <div
          style={{
            display: "flex",
            fontSize: 48,
            fontWeight: 700,
            color: OG.text,
          }}
        >
          User not found
        </div>
      </OGLayout>,
    );
  }

  const avatarUrl = await loadOgImage(data.image);

  return renderOGBytes(
    <OGLayout>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        {avatarUrl && (
          <img
            src={avatarUrl}
            alt=""
            width={140}
            height={140}
            style={{ borderRadius: "50%", border: `1px solid ${OG.border}` }}
          />
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 52,
              fontWeight: 700,
              color: OG.text,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            {data.name}
          </div>

          {data.work && (
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: OG.textSecondary,
                lineHeight: 1.3,
              }}
            >
              {data.work}
            </div>
          )}

          {data.bio && (
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: OG.textTertiary,
                lineHeight: 1.4,
                maxWidth: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {data.bio.length > 120
                ? `${data.bio.slice(0, 120)}...`
                : data.bio}
            </div>
          )}

          <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
            {data.followers_count > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 20,
                  color: OG.textSecondary,
                }}
              >
                <span style={{ fontWeight: 700, color: OG.text }}>
                  {data.followers_count}
                </span>
                followers
              </div>
            )}
            {data.following_count > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 20,
                  color: OG.textSecondary,
                }}
              >
                <span style={{ fontWeight: 700, color: OG.text }}>
                  {data.following_count}
                </span>
                following
              </div>
            )}
          </div>
        </div>
      </div>
    </OGLayout>,
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return ogResponse(await renderImage(slug));
}
