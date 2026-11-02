import { writeFileSync } from "node:fs";
import { isDevAdmin, seedFixtures } from "./fixtures";
import { STATE_FILE } from "./state";

export default async function globalSetup() {
  // Remember whether the dev user was an admin, so teardown can restore it.
  writeFileSync(STATE_FILE, JSON.stringify({ wasAdmin: await isDevAdmin() }));
  await seedFixtures();
}
