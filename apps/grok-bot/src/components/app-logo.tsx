import Image from "next/image";
import { colorFor, initials } from "./member-avatar";

// Hosts listed under images.remotePatterns in next.config.mjs. Community
// logos can be anywhere, so other hosts are shown as-is.
const OPTIMIZED_HOSTS = new Set([
  "cursor-cdn.com",
  "ptht05hbb1ssoooe.public.blob.vercel-storage.com",
  "avatars.githubusercontent.com",
]);

function optimizable(src: string) {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && OPTIMIZED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** An app's logo, or its initials on a palette color. */
export function AppLogo({
  name,
  logo,
  size = 40,
}: {
  name: string;
  logo: string | null;
  size?: number;
}) {
  return (
    <span
      className="app-logo"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        // Logos are drawn for light backgrounds; transparent ones would
        // vanish on the dark theme's tiles.
        background: logo ? "#fff" : colorFor(name),
      }}
    >
      {logo ? (
        <Image
          src={logo}
          alt=""
          width={size}
          height={size}
          unoptimized={!optimizable(logo)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
