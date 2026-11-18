import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
  transpilePackages: ["@directories/plugins"],
  serverExternalPackages: ["@xai-official/sdk"],
  // The Open Graph image routes read brand art from public/ with fs, which
  // isn't bundled into functions by default.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./public/og/**", "./public/brand/**"],
    "/bots/[slug]/opengraph-image": ["./public/bots/**", "./public/brand/**"],
    "/apps/[slug]/opengraph-image": ["./public/brand/**"],
  },
  images: {
    remotePatterns: [
      // Creator photos on official x.ai/bot marketplace listings.
      { hostname: "grok-bot-marketplace-public-assets.s3.amazonaws.com" },
      // X, GitHub and Google profile images on member accounts. Keep in step
      // with OPTIMIZED_HOSTS in src/components/member-avatar.tsx.
      { hostname: "pbs.twimg.com" },
      { hostname: "avatars.githubusercontent.com" },
      { hostname: "lh3.googleusercontent.com" },
      // Official app logos (Cursor Marketplace). Keep in step with
      // OPTIMIZED_HOSTS in src/components/app-logo.tsx.
      { hostname: "cursor-cdn.com" },
      { hostname: "ptht05hbb1ssoooe.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
