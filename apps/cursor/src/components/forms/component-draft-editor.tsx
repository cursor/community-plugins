"use client";

import { slugify } from "@directories/plugins/slug";
import {
  COMPONENT_TYPE_LABELS,
  COMPONENT_TYPES,
  type ComponentInput,
  type ComponentType,
} from "@directories/plugins/types";
import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * A plugin component as it exists while being edited in a form, before it is
 * mapped to a `ComponentInput` for the create/update actions.
 */
export type ComponentDraft = {
  id: string;
  type: ComponentType;
  /**
   * Stored DB (or parser-derived) slug, empty for components added in the
   * form. Preserved through the round-trip because regenerating from `name`
   * produces a different slug whenever name and slug were derived from
   * different sources (GitHub-imported rules slugify the filename but use
   * the frontmatter title/description as the name), which churns slugs,
   * breaks the rescan diff, and drops metadata keyed by the old slug.
   */
  slug: string;
  name: string;
  description: string;
  content: string;
};

export function newComponentDraft(): ComponentDraft {
  return {
    id: crypto.randomUUID(),
    type: "rule",
    slug: "",
    name: "",
    description: "",
    content: "",
  };
}

/**
 * Maps a draft to the payload shape accepted by the create/update plugin
 * actions. Callers filter out unnamed drafts first and decide whether to
 * attach `metadata` (create sends `{}`; update omits it so the action keeps
 * the previously stored metadata).
 */
export function draftToComponentInput(draft: ComponentDraft): ComponentInput {
  return {
    type: draft.type,
    name: draft.name.trim(),
    slug: draft.slug || slugify(draft.name),
    description: draft.description.trim() || undefined,
    content: draft.content.trim() || undefined,
  };
}

/**
 * Editable list of plugin components: type, name, description, and content
 * per component, plus add/remove. Used by the create (auto + manual tabs)
 * and edit plugin forms.
 */
export function ComponentDraftEditor({
  drafts,
  onChange,
  header,
}: {
  drafts: ComponentDraft[];
  onChange: (drafts: ComponentDraft[]) => void;
  /** Rendered to the left of the Add button, e.g. a label or count. */
  header: ReactNode;
}) {
  const addDraft = () => onChange([...drafts, newComponentDraft()]);

  const removeDraft = (id: string) =>
    onChange(drafts.filter((c) => c.id !== id));

  const updateDraft = (
    id: string,
    field: keyof Omit<ComponentDraft, "id">,
    value: string,
  ) =>
    onChange(drafts.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {header}
        <button
          type="button"
          onClick={addDraft}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3" />
          Add
        </button>
      </div>

      {drafts.map((comp, index) => (
        <div
          key={comp.id}
          className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-cursor"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Component {index + 1}
            </p>
            {drafts.length > 1 && (
              <button
                type="button"
                onClick={() => removeDraft(comp.id)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`component-type-${comp.id}`}
                className="mb-1.5 block text-sm font-medium"
              >
                Type
              </label>
              <Select
                value={comp.type}
                onValueChange={(v) => updateDraft(comp.id, "type", v)}
              >
                <SelectTrigger id={`component-type-${comp.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {COMPONENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                htmlFor={`component-name-${comp.id}`}
                className="mb-1.5 block text-sm font-medium"
              >
                Name
              </label>
              <Input
                id={`component-name-${comp.id}`}
                value={comp.name}
                onChange={(e) => updateDraft(comp.id, "name", e.target.value)}
                placeholder="my-rule"
                className="border-border placeholder:text-[#878787]"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor={`component-description-${comp.id}`}
              className="mb-1.5 block text-sm font-medium"
            >
              Description
              <span className="ml-1 font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <Input
              id={`component-description-${comp.id}`}
              value={comp.description}
              onChange={(e) =>
                updateDraft(comp.id, "description", e.target.value)
              }
              placeholder="What this component does"
              className="border-border placeholder:text-[#878787]"
            />
          </div>
          <div>
            <label
              htmlFor={`component-content-${comp.id}`}
              className="mb-1.5 block text-sm font-medium"
            >
              Content
            </label>
            <Textarea
              id={`component-content-${comp.id}`}
              value={comp.content}
              onChange={(e) => updateDraft(comp.id, "content", e.target.value)}
              placeholder="Paste or write the component content here..."
              className="min-h-[100px] border-border font-mono text-sm placeholder:text-[#878787] placeholder:font-sans"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
