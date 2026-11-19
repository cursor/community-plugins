import Image from "next/image";
import { sharpXPhoto } from "@/lib/x-photo";

const PALETTE = [
  "#1084FE",
  "#FF6700",
  "#9159FE",
  "#00C972",
  "#FF309B",
  "#00BCA6",
  "#FF263C",
  "#FF9800",
  "#97683D",
  "#777777",
];

export function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

// Hosts listed under images.remotePatterns in next.config.mjs. Photos from
// anywhere else (creators link their own) are shown as-is, since next/image
// refuses to render an unlisted host.
const OPTIMIZED_HOSTS = new Set([
  "grok-bot-marketplace-public-assets.s3.amazonaws.com",
  "pbs.twimg.com",
  "avatars.githubusercontent.com",
  "lh3.googleusercontent.com",
]);

function optimizable(src: string) {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && OPTIMIZED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** A creator or member photo, or their initials on a palette color. */
export function MemberAvatar({
  name,
  image,
  size = 32,
}: {
  name: string;
  image: string | null;
  size?: number;
}) {
  const photo = image && sharpXPhoto(image);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: photo ? "var(--pill)" : colorFor(name),
      }}
      title={name}
    >
      {photo ? (
        <Image
          src={photo}
          alt=""
          // Asked for at three times the size it's shown: phones have 3x
          // screens, and a photo that isn't square is resized by its width,
          // which leaves a wide one too few rows to fill the circle.
          width={size * 3}
          height={size * 3}
          unoptimized={!optimizable(photo)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
