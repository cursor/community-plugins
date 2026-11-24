import { cacheLife, cacheTag } from "next/cache";
import { getPluginBySlug } from "@/data/queries";
import {
  formatCount,
  loadOgImage,
  OG,
  OGLayout,
  ogResponse,
  renderOGBytes,
} from "@/lib/og";

export const alt = "Plugin";
export const size = { width: OG.width, height: OG.height };
export const contentType = "image/png";

async function renderImage(slug: string) {
  "use cache";
  cacheLife("days");
  cacheTag("plugins", `plugin-${slug}`);

  const { data } = await getPluginBySlug(slug);

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
          Plugin not found
        </div>
      </OGLayout>,
    );
  }

  const logoUrl = await loadOgImage(data.logo);

  const components = data.plugin_components ?? [];
  const typeCounts: Record<string, number> = {};
  for (const c of components) {
    typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
  }
  const componentSummary = Object.entries(typeCounts)
    .map(([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`)
    .join(" · ");

  return renderOGBytes(
    <OGLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 72,
              height: 72,
              borderRadius: 16,
              border: `1px solid ${OG.border}`,
              backgroundColor: OG.cardBg,
              padding: 6,
            }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                width={60}
                height={60}
                style={{ borderRadius: 10, objectFit: "contain" }}
              />
            ) : (
              <span
                style={{
                  display: "flex",
                  fontSize: 32,
                  fontWeight: 700,
                  color: OG.textSecondary,
                }}
              >
                {data.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 48,
                fontWeight: 700,
                color: OG.text,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              {data.name}
            </div>
            {data.author_name && (
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  color: OG.textSecondary,
                }}
              >
                by {data.author_name}
              </div>
            )}
          </div>
        </div>

        {data.description && (
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: OG.textSecondary,
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            {data.description.length > 150
              ? `${data.description.slice(0, 150)}...`
              : data.description}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 22,
              color: OG.text,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span style={{ display: "flex", fontWeight: 700 }}>
              {formatCount(data.install_count)}
            </span>
          </div>

          {componentSummary && (
            <div
              style={{ display: "flex", fontSize: 20, color: OG.textTertiary }}
            >
              {componentSummary}
            </div>
          )}
        </div>

        {data.keywords && data.keywords.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data.keywords.slice(0, 6).map((kw) => (
              <div
                key={kw}
                style={{
                  display: "flex",
                  fontSize: 16,
                  color: OG.textSecondary,
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: `1px solid ${OG.border}`,
                  backgroundColor: OG.cardBg,
                }}
              >
                {kw}
              </div>
            ))}
          </div>
        )}
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
