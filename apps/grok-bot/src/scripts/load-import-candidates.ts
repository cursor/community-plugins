// Loads candidate apps into `app_import_candidates`, where the site's
// import-apps job checks and adds them a few at a time (the same checks as
// import-candidates.ts, without a machine having to stay on).
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… \
//     bun run src/scripts/load-import-candidates.ts <candidates.json> \
//     [--batch NAME] [--priority N]
//
// <candidates.json> is the list import-candidates.ts takes. A candidate
// already in the table is left as it is, so loading twice is harmless.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

type Candidate = {
  kind: "repo" | "server";
  key: string;
  name: string;
  description: string;
  logo: string;
  homepage: string;
  cursor: boolean;
  sharedName?: boolean;
  publisher?: string;
  rename?: string;
  slug?: string;
  allowSameName?: boolean;
};

const args = process.argv.slice(2);
const [input] = args;
const option = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!input || !url || !secret) {
  console.error("needs <candidates.json> and the Supabase env");
  process.exit(1);
}
const batch = option("--batch", new Date().toISOString().slice(0, 10));
const priority = Number(option("--priority", "0"));
const supabase = createClient(url, secret, { auth: { persistSession: false } });

const candidates = JSON.parse(readFileSync(input, "utf8")) as Candidate[];
const rows = candidates.map((c) => ({
  kind: c.kind,
  key: c.key,
  name: c.name ?? "",
  description: c.description ?? "",
  logo: c.logo ?? "",
  homepage: c.homepage ?? "",
  cursor: c.cursor === true,
  shared_name: c.sharedName === true,
  publisher: c.publisher ?? null,
  rename: c.rename ?? null,
  slug: c.slug ?? null,
  allow_same_name: c.allowSameName === true,
  batch,
  priority,
}));

let loaded = 0;
for (let i = 0; i < rows.length; i += 200) {
  const { data, error } = await supabase
    .from("app_import_candidates")
    .upsert(rows.slice(i, i + 200), {
      onConflict: "key",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) {
    console.error(`loading failed: ${error.message}`);
    process.exit(1);
  }
  loaded += data?.length ?? 0;
}
console.log(
  `${loaded} loaded into batch "${batch}", ${rows.length - loaded} already there`,
);
