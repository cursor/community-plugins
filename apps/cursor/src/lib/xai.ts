import "server-only";

import { SpaceXSI } from "@xai-official/sdk";

// Official xAI TypeScript SDK (github.com/xai-org/xai-sdk-ts). Reads
// XAI_API_KEY; requests are sent with store: false by default.
export const XAI_MODEL = "grok-4.7";
export const xaiConfigured = () => !!process.env.XAI_API_KEY;

let client: SpaceXSI | null = null;

export function xai(): SpaceXSI {
  // retryBeforeOutput retries "service temporarily unavailable" failures
  // that happen before the model writes anything.
  client ??= new SpaceXSI({
    timeout: 120_000,
    maxRetries: 2,
    retryBeforeOutput: true,
  });
  return client;
}
