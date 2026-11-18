import { getApp } from "@/data/apps";

type Params = { params: Promise<{ slug: string; skill: string }> };

/**
 * A listed app's skill as a SKILL.md file, for Grok Bot's agent to fetch when
 * an Add to Grok Bot message asks it to add the skill. It's the text the
 * security scan reviewed, rather than whatever the app's repository holds
 * now.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug, skill } = await params;
  const app = await getApp(slug);
  const found = app?.components.find(
    (c) => c.type === "skill" && c.slug === skill && c.content,
  );
  if (!found?.content)
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  // JSON strings are valid YAML double-quoted scalars.
  const frontmatter = [
    "---",
    `name: ${JSON.stringify(found.name)}`,
    ...(found.description
      ? [`description: ${JSON.stringify(found.description)}`]
      : []),
    "---",
  ].join("\n");
  return new Response(`${frontmatter}\n\n${found.content.trim()}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
