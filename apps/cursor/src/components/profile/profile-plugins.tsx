import type { PluginRow } from "@directories/plugins/types";
import type { PluginCardData } from "@/components/plugins/plugin-card";
import { PluginCard } from "@/components/plugins/plugin-card";
import { getUserPlugins } from "@/data/queries";

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
    verified: plugin.verified,
    unpublished: !plugin.active,
    href: `/plugins/${plugin.slug}`,
  };
}

export async function ProfilePlugins({
  userId,
  isOwner,
}: {
  userId: string;
  isOwner: boolean;
}) {
  const { data } = await getUserPlugins(userId, { includeInactive: isOwner });
  const plugins = (data ?? []).map(toPluginCard);

  if (!plugins?.length) {
    return (
      <div className="surface-card mt-6 flex h-full flex-col items-center justify-center rounded-lg py-12 text-center">
        <p className="mb-2 text-sm text-muted-foreground">
          No plugins added yet
        </p>
        {isOwner ? (
          <p className="text-sm text-muted-foreground">
            Submit a plugin to show it on your profile.
          </p>
        ) : null}
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
