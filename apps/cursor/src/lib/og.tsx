import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

export { formatCount } from "@/lib/utils";

export const OG = {
  width: 1200,
  height: 630,
  bg: "#14120b",
  text: "#edecec",
  textSecondary: "rgba(237, 236, 236, 0.7)",
  textTertiary: "rgba(237, 236, 236, 0.48)",
  brand: "#f54e00",
  border: "rgba(237, 236, 236, 0.08)",
  cardBg: "#1b1913",
};

const OG_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

function ogSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://cursor.directory";
}

/**
 * Satori requires absolute http(s) image URLs. Plugin logos are sometimes stored
 * as site-relative paths (e.g. `assets/logo.png`).
 */
function resolveOgImageUrl(src: string | null | undefined): string | null {
  const trimmed = src?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Fall through — treat as a path relative to the site origin.
  }

  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return new URL(path, ogSiteOrigin()).toString();
}

// A logo larger than this isn't worth holding up a share card for.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 5_000;

/** The type of a picture Satori can draw, read from its first bytes. */
function rasterType(bytes: Uint8Array): string | null {
  const starts = (signature: (number | null)[]) =>
    signature.every((byte, i) => byte === null || bytes[i] === byte);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (
    starts([0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42])
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Whether Satori can size this SVG: its `<svg>` tag needs a `viewBox`, or a
 * `width` and `height` in plain numbers. Without them it throws.
 */
function drawableSvg(text: string): boolean {
  const tag = text.match(/<svg[^>]*>/i)?.[0];
  if (!tag) return false;
  const viewBox = tag.match(/viewBox=['"]([^'"]+)['"]/)?.[1];
  if (viewBox) {
    const numbers = viewBox.split(/[, ]/).filter(Boolean).map(Number);
    if (numbers.length === 4 && numbers.every(Number.isFinite)) return true;
  }
  return (
    /width=['"](\d*\.?\d+)['"]/.test(tag) &&
    /height=['"](\d*\.?\d+)['"]/.test(tag)
  );
}

/**
 * A logo or photo as a data URI Satori can draw, or null when it can't be
 * drawn, so the card shows its fallback instead of an empty box.
 *
 * Logos come from anywhere: submitted URLs, site icons, uploads. Left to
 * fetch one itself, Satori draws nothing (and logs an error) for a type it
 * doesn't know (an icon file, AVIF, an error page), for an SVG served without
 * the SVG content type, and for an SVG with any non-Latin character in it.
 * Reading the bytes here covers the last two and lets us tell in advance.
 */
export async function loadOgImage(
  src: string | null | undefined,
): Promise<string | null> {
  const url = resolveOgImageUrl(src);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;

    const type =
      rasterType(bytes) ??
      (drawableSvg(bytes.toString("utf8")) ? "image/svg+xml" : null);
    return type ? `data:${type};base64,${bytes.toString("base64")}` : null;
  } catch {
    return null;
  }
}

export async function loadFonts() {
  const [regular, bold] = await Promise.all([
    readFile(
      join(process.cwd(), "public/assets/fonts/CursorGothic-Regular.ttf"),
    ),
    readFile(join(process.cwd(), "public/assets/fonts/CursorGothic-Bold.ttf")),
  ]);
  return [
    { name: "CursorGothic", data: regular, weight: 400 as const },
    { name: "CursorGothic", data: bold, weight: 700 as const },
  ];
}

export function CursorIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="80 60 350 395"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="m415.035 156.35-151.503-87.4695c-4.865-2.8094-10.868-2.8094-15.733 0l-151.4969 87.4695c-4.0897 2.362-6.6146 6.729-6.6146 11.459v176.383c0 4.73 2.5249 9.097 6.6146 11.458l151.5039 87.47c4.865 2.809 10.868 2.809 15.733 0l151.504-87.47c4.089-2.361 6.614-6.728 6.614-11.458v-176.383c0-4.73-2.525-9.097-6.614-11.459zm-9.516 18.528-146.255 253.32c-.988 1.707-3.599 1.01-3.599-.967v-165.872c0-3.314-1.771-6.379-4.644-8.044l-143.645-82.932c-1.707-.988-1.01-3.599.968-3.599h292.509c4.154 0 6.75 4.503 4.673 8.101h-.007z"
        fill="#edecec"
      />
    </svg>
  );
}

export function LogoLockup({ height = 24 }: { height?: number }) {
  const aspect = 1466 / 203;
  const w = Math.round(height * aspect);
  return (
    <svg
      width={w}
      height={height}
      viewBox="0 0 1466 203"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M89.1354 202.61C87.6954 202.61 86.2554 202.178 85.1034 201.602L3.59935 154.37C1.58335 153.218 -0.000647783 150.77 -0.000647783 148.178V53.8578C-0.000647783 51.1218 1.58335 49.1058 3.59935 47.9538L85.1034 1.00984C86.2554 0.433844 87.6954 0.00184059 89.1354 0.00184059C90.5754 0.00184059 92.0154 0.433844 93.1674 1.00984L174.527 47.9538C176.543 49.1058 177.839 51.1218 177.839 53.8578V148.178C177.839 150.77 176.543 153.218 174.527 154.37L93.1674 201.602C92.0154 202.178 90.5754 202.61 89.1354 202.61ZM169.199 57.7458C169.487 57.1698 169.631 56.5938 169.631 56.1618C169.631 54.5778 168.479 53.2818 166.463 53.2818H10.0794C9.07135 53.2818 8.63935 54.5778 9.64735 55.1538L86.3994 99.5058C88.1274 100.514 88.9914 102.098 88.9914 103.97V192.962C88.9914 193.97 90.4314 194.258 91.0074 193.394L169.199 57.7458ZM273.599 155.09C243.359 155.09 222.047 137.378 222.047 103.682C222.047 69.9858 244.943 52.2738 275.039 52.2738H309.599V71.2818H276.191C258.191 71.2818 244.079 81.6498 244.079 103.682C244.079 125.714 258.191 136.082 276.191 136.082H309.599V155.09H273.599ZM372.671 156.818C341.711 156.818 327.311 142.13 327.311 119.378V52.2738H348.623V115.058C348.623 130.754 355.823 138.098 372.671 138.098C389.519 138.098 396.719 130.754 396.719 115.058V52.2738H418.031V119.522C418.031 142.274 403.631 156.818 372.671 156.818ZM438.623 155.09V52.2738H497.663C516.959 52.2738 529.775 62.0658 529.775 81.3618C529.775 92.8818 523.295 101.666 514.511 105.41V105.698C523.727 106.994 528.335 113.618 528.479 122.546L528.911 155.09H507.599L507.167 126.146C507.023 119.666 503.135 115.634 495.503 115.634H459.935V155.09H438.623ZM495.071 97.9218C503.135 97.9218 508.319 93.0258 508.319 84.2418C508.319 75.4578 503.567 70.7058 494.783 70.7058H459.935V97.9218H495.071ZM546.335 155.09V136.658H599.039C605.951 136.658 610.415 131.906 610.415 124.994C610.415 117.794 605.663 114.626 598.607 114.05L574.847 111.89C554.399 110.018 543.743 101.954 543.743 82.5138C543.743 62.9298 556.847 52.2738 575.855 52.2738H628.271V70.7058H577.295C569.951 70.7058 565.199 74.5938 565.199 81.7938C565.199 89.1378 570.095 92.7378 577.439 93.3138L601.631 95.3298C619.919 96.9138 631.871 105.266 631.871 124.85C631.871 144.146 619.199 155.09 601.199 155.09H546.335ZM693.791 156.818C661.535 156.818 641.231 135.938 641.231 103.538C641.231 71.1378 662.399 50.5458 694.655 50.5458C726.911 50.5458 747.215 71.1378 747.215 103.538C747.215 135.938 726.047 156.818 693.791 156.818ZM694.223 138.098C712.511 138.098 725.183 125.282 725.183 103.682C725.183 81.9378 712.511 69.2658 694.223 69.2658C675.935 69.2658 663.263 81.9378 663.263 103.682C663.263 125.282 675.935 138.098 694.223 138.098ZM761.471 155.09V52.2738H820.511C839.807 52.2738 852.623 62.0658 852.623 81.3618C852.623 92.8818 846.143 101.666 837.359 105.41V105.698C846.575 106.994 851.183 113.618 851.327 122.546L851.759 155.09H830.447L830.015 126.146C829.871 119.666 825.983 115.634 818.351 115.634H782.783V155.09H761.471ZM817.919 97.9218C825.983 97.9218 831.167 93.0258 831.167 84.2418C831.167 75.4578 826.415 70.7058 817.631 70.7058H782.783V97.9218H817.919ZM909.947 155.09V52.2738H942.779C971.147 52.2738 991.163 67.9698 991.163 103.682C991.163 139.538 971.147 155.09 942.779 155.09H909.947ZM941.483 142.994C963.371 142.994 976.907 130.466 976.907 103.682C976.907 76.7538 963.227 64.3698 941.483 64.3698H924.059V142.994H941.483ZM1004.17 155.09V78.0498H1017.85V155.09H1004.17ZM1003.59 66.9618V52.2738H1018.28V66.9618H1003.59ZM1034.73 155.09V89.8578L1034.44 78.0498H1048.12L1048.26 90.0018H1048.69C1050.42 83.8098 1057.19 76.6098 1068.71 76.6098H1072.17V88.8498H1066.12C1054.74 88.8498 1048.26 97.9218 1048.26 112.178V155.09H1034.73ZM1110.18 156.818C1086.85 156.818 1074.18 142.994 1074.18 116.498C1074.18 89.8578 1089.44 76.3218 1110.61 76.3218C1133.65 76.3218 1144.74 90.4338 1144.74 117.794V119.378H1087.28C1088.14 136.802 1096.21 146.306 1110.46 146.306C1120.4 146.306 1128.18 141.41 1130.19 131.762H1143.44C1141.14 148.322 1127.31 156.818 1110.18 156.818ZM1131.2 109.154C1129.76 94.4658 1122.7 86.5458 1110.18 86.5458C1097.79 86.5458 1089.58 94.4658 1087.71 109.154H1131.2ZM1188.83 156.818C1165.36 156.818 1152.68 141.986 1152.68 116.498C1152.68 90.8658 1166.51 76.3218 1189.55 76.3218C1209.13 76.3218 1220.51 86.4018 1221.52 101.09H1207.98C1206.4 92.0178 1198.91 86.9778 1189.12 86.9778C1173.85 86.9778 1166.22 98.4978 1166.22 116.498C1166.22 134.642 1174 146.162 1189.12 146.162C1198.76 146.162 1206.97 141.554 1208.56 131.186H1222.09C1219.79 148.178 1205.68 156.818 1188.83 156.818ZM1253.85 155.09C1243.19 155.09 1237.14 151.922 1237.14 138.962V87.9858H1226.49V78.0498H1237.14V59.6178H1250.54V78.0498H1264.5V87.9858H1250.54V137.666C1250.54 142.274 1252.26 144.434 1256.44 144.434H1263.78V155.09H1253.85ZM1306.33 156.818C1283.43 156.818 1270.19 141.986 1270.19 116.498C1270.19 90.8658 1283.43 76.3218 1306.33 76.3218C1329.08 76.3218 1342.19 91.0098 1342.19 116.498C1342.19 142.13 1329.08 156.818 1306.33 156.818ZM1306.33 146.162C1321.02 146.162 1328.65 134.498 1328.65 116.498C1328.65 98.3538 1320.87 86.9778 1306.33 86.9778C1291.5 86.9778 1283.72 98.4978 1283.72 116.498C1283.72 134.642 1291.5 146.162 1306.33 146.162ZM1354.7 155.09V89.8578L1354.42 78.0498H1368.1L1368.24 90.0018H1368.67C1370.4 83.8098 1377.17 76.6098 1388.69 76.6098H1392.14V88.8498H1386.1C1374.72 88.8498 1368.24 97.9218 1368.24 112.178V155.09H1354.7ZM1400.41 180.866V170.21H1407.61C1416.97 170.21 1420 166.898 1422.3 159.842L1423.45 156.674L1393.36 78.0498H1408.19L1420.86 114.05C1424.6 124.706 1426.62 131.474 1429.21 141.554H1429.79C1432.38 131.474 1434.25 124.994 1438.14 114.05L1450.81 78.0498H1465.07L1433.24 165.17C1429.07 176.402 1423.88 180.866 1410.35 180.866H1400.41Z"
        fill={OG.textSecondary}
      />
    </svg>
  );
}

export function OGLayout({ children }: { children: ReactElement }) {
  return (
    <div
      style={{
        width: OG.width,
        height: OG.height,
        display: "flex",
        flexDirection: "column",
        backgroundColor: OG.bg,
        fontFamily: "CursorGothic, sans-serif",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 80px 0",
        }}
      >
        {children}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          height: 80,
          borderTop: `1px solid ${OG.border}`,
        }}
      >
        <LogoLockup height={22} />
        <span
          style={{
            color: OG.textTertiary,
            fontSize: 18,
            letterSpacing: "0.01em",
          }}
        >
          cursor.directory
        </span>
      </div>
    </div>
  );
}

/**
 * Renders an OG element tree to PNG bytes.
 *
 * With Cache Components, OG routes cache the *bytes* (serializable) rather
 * than the `ImageResponse` (a Response, not serializable). Call this inside a
 * `"use cache"` scope — build the JSX in the same scope, since React elements
 * must not cross a cache boundary as introspected arguments.
 */
export async function renderOGBytes(
  element: ReactElement,
): Promise<Uint8Array> {
  const fonts = await loadFonts();
  const image = new ImageResponse(element, {
    width: OG.width,
    height: OG.height,
    fonts,
  });
  return new Uint8Array(await image.arrayBuffer());
}

export function ogResponse(bytes: Uint8Array) {
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": OG_CACHE_CONTROL,
    },
  });
}

/**
 * Cached static listing card, keyed by (title, subtitle). `max` lifetime:
 * the copy only changes with a deploy, and the build id rotates cache keys.
 */
export async function renderListingOGBytes(title: string, subtitle: string) {
  "use cache";
  cacheLife("max");
  return renderOGBytes(
    <OGLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            color: OG.text,
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: OG.textSecondary,
            lineHeight: 1.4,
            maxWidth: 800,
          }}
        >
          {subtitle}
        </div>
      </div>
    </OGLayout>,
  );
}
