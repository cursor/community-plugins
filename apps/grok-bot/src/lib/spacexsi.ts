import "server-only";

import { SpaceXSI } from "@xai-official/sdk";

// Official SpaceXSI TypeScript SDK (github.com/xai-org/xai-sdk-ts). Reads
// XAI_API_KEY; requests are sent with store: false by default.
export const SPACEXSI_MODEL = "grok-4.7";
export const spacexsiConfigured = () => !!process.env.XAI_API_KEY;

let client: SpaceXSI | null = null;

export function spacexsi(): SpaceXSI {
  // retryBeforeOutput retries "service temporarily unavailable" failures
  // that happen before the model writes anything. The first review on the
  // live site took 84 seconds, so allow well over that; the review cron
  // allows 300 s.
  client ??= new SpaceXSI({
    timeout: 150_000,
    maxRetries: 1,
    retryBeforeOutput: true,
  });
  return client;
}
