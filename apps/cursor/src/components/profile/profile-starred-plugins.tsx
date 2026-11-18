import type { PluginRow } from "@directories/plugins/types";
import type { PluginCardData } from "@/components/plugins/plugin-card";
import { PluginCard } from "@/components/plugins/plugin-card";
import { getStarredPlugins } from "@/data/queries";

function getPluginType(
  components: { type: string }[],
): "rules" | "mcp" | "both" {
  const hasRules = components.some((c) => c.type === "rule");
  const hasMcp = components.some((c) => c.type === "mcp_server");
  if (hasRules && hasMcp) return "both";
  if (hasMcp) return "mcp";
  return "rules";
}

function toPluginCard(plugin: PluginRow): PluginCardData {
  const components = plugin.plugin_components ?? [];
  return {
    name: plugin.name,
    slug: plugin.slug,
    description: plugin.description ?? "",
    logo: plugin.logo,
    type: getPluginType(components),
    rulesCount: components.filter((c) => c.type === "rule").length,
    mcpCount: components.filter((c) => c.type === "mcp_server").length,
    keywords: plugin.keywords,
    installCount: plugin.install_count,
    href: `/plugins/${plugin.slug}`,
  };
}

export async function ProfileStarredPlugins({ userId }: { userId: string }) {
  const { data } = await getStarredPlugins(userId);
  const plugins = (data ?? []).map(toPluginCard);

  if (!plugins.length) {
    return (
      <div className="surface-card mt-6 flex h-full flex-col items-center justify-center rounded-lg py-12 text-center">
        <p className="text-sm text-muted-foreground">No starred plugins yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard key={plugin.slug} plugin={plugin} />
      ))}
    </div>
  );
}
