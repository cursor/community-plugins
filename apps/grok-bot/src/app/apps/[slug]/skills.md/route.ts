import { getApp } from "@/data/apps";
import { siteUrl } from "@/lib/og";

type Params = { params: Promise<{ slug: string }> };

/**
 * A listed app's skills as a list of SKILL.md links. An Add to Grok Bot
 * message points here instead of naming every skill when naming them all
 * would go over the link's 1,000 characters.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const app = await getApp(slug);
  const skills = (app?.components ?? []).filter(
    (c) => c.type === "skill" && c.content,
  );
  if (!app || skills.length === 0)
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  const lines = skills.map(
    (s) =>
      `- ${s.name}: ${siteUrl()}/apps/${app.slug}/skills/${s.slug}/SKILL.md`,
  );
  return new Response(
    `# Skills in ${app.name}\n\nFetch each SKILL.md below and save it as a skill.\n\n${lines.join("\n")}\n`,
    {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
