import Image from "next/image";

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

function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string) {
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
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: image ? "var(--pill)" : colorFor(name),
      }}
      title={name}
    >
      {image ? (
        <Image
          src={image}
          alt=""
          width={size}
          height={size}
          unoptimized={!optimizable(image)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
