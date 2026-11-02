import { tmpdir } from "node:os";
import { join } from "node:path";

export const STATE_FILE = join(tmpdir(), "grok-bot-e2e-state.json");
