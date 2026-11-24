import { cacheLife, cacheTag } from "next/cache";
import { getCompanyProfile } from "@/data/queries";
import { loadOgImage, OG, OGLayout, ogResponse, renderOGBytes } from "@/lib/og";

export const alt = "Company Profile";
export const size = { width: OG.width, height: OG.height };
export const contentType = "image/png";

async function renderImage(slug: string) {
  "use cache";
  cacheLife("days");
  cacheTag("companies", `company-${slug}`);

  const { data } = await getCompanyProfile(slug);

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
          Company not found
        </div>
      </OGLayout>,
    );
  }

  const logoUrl = await loadOgImage(data.image);

  return renderOGBytes(
    <OGLayout>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        {logoUrl && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 120,
              height: 120,
              borderRadius: 20,
              border: `1px solid ${OG.border}`,
              backgroundColor: OG.cardBg,
              padding: 8,
            }}
          >
            <img
              src={logoUrl}
              alt=""
              width={104}
              height={104}
              style={{ borderRadius: 14, objectFit: "contain" }}
            />
          </div>
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

          {data.location && (
            <div
              style={{
                fontSize: 24,
                color: OG.textSecondary,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={OG.textSecondary}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {data.location}
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
              }}
            >
              {data.bio.length > 120
                ? `${data.bio.slice(0, 120)}...`
                : data.bio}
            </div>
          )}
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
