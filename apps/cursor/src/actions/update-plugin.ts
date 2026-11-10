"use server";

import { resolveComponentSlug } from "@directories/plugins/slug";
import {
  type ComponentInput,
  componentInputSchema,
} from "@directories/plugins/types";
import { updateTag } from "next/cache";
import { z } from "zod";
import { enqueuePluginScan, kickDrainAfterResponse } from "@/lib/plugins/queue";
import { pluginScanLimit } from "@/lib/rate-limit";
import { createClient } from "@/utils/supabase/admin-client";
import { ActionError, authActionClient } from "./safe-action";

type ExistingComponent = {
  type: string;
  name: string;
  slug: string;
  description: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  sort_order: number;
};

function componentKey(type: string, slug: string): string {
  return `${type}:${slug}`;
}

// Only fields that affect the install payload — cosmetic edits to name,
// description, or sort_order must not trigger a rescan. MCP install links and
// configs can live in metadata, so compare the metadata that will be saved.
function fingerprintComponent(c: {
  type: string;
  slug?: string | null;
  name: string;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const slug = resolveComponentSlug(c);
  return JSON.stringify({
    type: c.type,
    slug,
    content: c.content ?? "",
    metadata: c.metadata ?? {},
  });
}

function resolveComponentMetadata(
  comp: ComponentInput,
  prevByKey: Map<string, ExistingComponent>,
): Record<string, unknown> {
  const slug = resolveComponentSlug(comp);
  const submitted = comp.metadata;
  if (submitted && Object.keys(submitted).length > 0) {
    return submitted;
  }
  const prev = prevByKey.get(componentKey(comp.type, slug));
  return prev?.metadata ?? {};
}

function installRelevantChanged(
  prevComponents: ExistingComponent[],
  prevRepository: string | null,
  nextComponents: ComponentInput[],
  nextRepository: string | null,
): boolean {
  if ((prevRepository ?? null) !== (nextRepository ?? null)) {
    return true;
  }

  if (prevComponents.length !== nextComponents.length) {
    return true;
  }

  const prevSorted = [...prevComponents]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(fingerprintComponent)
    .sort();
  const prevByKey = new Map(
    prevComponents.map((c) => [
      componentKey(c.type, resolveComponentSlug(c)),
      c,
    ]),
  );
  const nextSorted = nextComponents
    .map((component) =>
      fingerprintComponent({
        ...component,
        metadata: resolveComponentMetadata(component, prevByKey),
      }),
    )
    .sort();

  for (let i = 0; i < prevSorted.length; i++) {
    if (prevSorted[i] !== nextSorted[i]) return true;
  }
  return false;
}

export const updatePluginAction = authActionClient
  .metadata({
    actionName: "update-plugin",
  })
  .schema(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(2, "Name must be at least 2 characters"),
      description: z
        .string()
        .min(10, "Description must be at least 10 characters"),
      logo: z.string().nullable().optional(),
      repository: z.string().url().nullable().optional(),
      homepage: z.string().url().nullable().optional(),
      keywords: z.array(z.string()).optional(),
      components: z
        .array(componentInputSchema)
        .min(1, "At least one component is required"),
    }),
  )
  .action(
    async ({
      parsedInput: {
        id,
        name,
        description,
        logo,
        repository,
        homepage,
        keywords,
        components,
      },
      ctx: { userId },
    }) => {
      const supabase = await createClient();

      const { data: existing, error: fetchError } = await supabase
        .from("plugins")
        .select(
          "id, owner_id, slug, repository, github_repo_id, active, plugin_components(type, name, slug, description, content, metadata, sort_order)",
        )
        .eq("id", id)
        .single();

      if (fetchError || !existing) {
        throw new ActionError("Plugin not found.");
      }

      if (existing.owner_id !== userId) {
        throw new ActionError(
          "You do not have permission to edit this plugin.",
        );
      }

      // Source URL is pinned to the parsed GitHub repo so an owner can't keep
      // the verified-looking badge while swapping the install payload.
      const repositoryLocked = existing.github_repo_id != null;
      const effectiveRepository = repositoryLocked
        ? (existing.repository ?? null)
        : (repository ?? null);

      const prevComponents = (existing.plugin_components ??
        []) as ExistingComponent[];

      const installChanged = installRelevantChanged(
        prevComponents,
        existing.repository ?? null,
        components,
        effectiveRepository,
      );

      const shouldRescan = installChanged;
      if (shouldRescan) {
        const { success } = await pluginScanLimit(userId);
        if (!success) {
          throw new ActionError(
            "Too many plugin updates in the last hour. Please try again later.",
          );
        }
      }

      const prevByKey = new Map(
        prevComponents.map((c) => [
          componentKey(c.type, resolveComponentSlug(c)),
          c,
        ]),
      );

      const componentRows = components.map((comp, i) => ({
        plugin_id: id,
        type: comp.type,
        name: comp.name,
        slug: resolveComponentSlug(comp),
        description: comp.description || null,
        content: comp.content || null,
        metadata: resolveComponentMetadata(comp, prevByKey),
        sort_order: i,
      }));

      const { error: updateError } = await supabase.rpc(
        "update_plugin_with_components",
        {
          p_plugin_id: id,
          p_name: name,
          p_description: description,
          p_logo: logo || null,
          p_repository: effectiveRepository,
          p_homepage: homepage || null,
          p_keywords: keywords || [],
          p_components: componentRows,
          p_deactivate_for_scan: shouldRescan && existing.active,
        },
      );

      if (updateError) {
        if (updateError.code === "23505") {
          throw new ActionError(
            "A plugin with this name already exists. Please choose a different name.",
          );
        }
        throw new ActionError(
          `Failed to update plugin: ${updateError.message}`,
        );
      }

      if (shouldRescan) {
        try {
          await enqueuePluginScan(id);
          kickDrainAfterResponse();
        } catch (queueError) {
          console.error("Failed to enqueue plugin scan", queueError);
        }
      }

      updateTag("plugins");
      updateTag(`plugin-${existing.slug}`);

      return {
        slug: existing.slug,
        rescanQueued: shouldRescan,
        repositoryLocked,
      };
    },
  );
