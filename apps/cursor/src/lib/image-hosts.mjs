// Hosts next/image may optimize (images.remotePatterns in next.config.mjs).
// Plugin logos from anywhere else are shown unoptimized: an unlisted host
// would otherwise make next/image throw and take the page down.
export const OPTIMIZED_IMAGE_HOSTS = [
  // Logos of plugins imported from the Cursor Marketplace.
  "cursor-cdn.com",
  "ptht05hbb1ssoooe.public.blob.vercel-storage.com",
  "cdn.brandfetch.io",
  "pbs.twimg.com",
  "midday.ai",
  "pub-abe1cd4008f5412abb77357f87d7d7bb.r2.dev",
  "avatars.githubusercontent.com",
  "knhgkaawjfqqwmsgmxns.supabase.co",
  "service.cursor.directory",
  "console.settlemint.com",
  "assets.serverless-extras.com",
  "images.lumacdn.com",
];
