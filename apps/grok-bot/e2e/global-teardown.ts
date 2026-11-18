import { existsSync, readFileSync, rmSync } from "node:fs";
import { removeFixtures, setDevAdmin } from "./fixtures";
import { STATE_FILE } from "./state";

export default async function globalTeardown() {
  await removeFixtures();
  if (!existsSync(STATE_FILE)) return;
  const { wasAdmin } = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  await setDevAdmin(wasAdmin);
  rmSync(STATE_FILE);
}
