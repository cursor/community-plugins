"use client";

import type { PluginRow } from "@directories/plugins/types";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { updatePluginAction } from "@/actions/update-plugin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UploadLogo from "../upload-logo";
import {
  type ComponentDraft,
  ComponentDraftEditor,
  draftToComponentInput,
} from "./component-draft-editor";

export function EditPluginForm({ data }: { data: PluginRow }) {
  const [name, setName] = useState(data.name);
  const [description, setDescription] = useState(data.description ?? "");
  const [logo, setLogo] = useState<string | null>(data.logo);
  const [repository, setRepository] = useState(data.repository ?? "");
  const repositoryLocked = data.github_repo_id != null;
  const [homepage, setHomepage] = useState(data.homepage ?? "");
  const [keywords, setKeywords] = useState(data.keywords.join(", "));
  const [components, setComponents] = useState<ComponentDraft[]>(
    (data.plugin_components ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({
        id: crypto.randomUUID(),
        type: c.type,
        slug: c.slug,
        name: c.name,
        description: c.description ?? "",
        content: c.content ?? "",
      })),
  );
  const [error, setError] = useState<string | null>(null);

  const { execute, isExecuting } = useAction(updatePluginAction, {
    onSuccess: () => {
      toast.success("Plugin updated successfully.");
    },
    onError: ({ error: actionError }) => {
      setError(
        actionError.serverError ?? "Failed to update plugin. Please try again.",
      );
    },
  });

  const onSubmit = () => {
    setError(null);

    const validComponents = components.filter((c) => c.name.trim());
    if (!name.trim() || !description.trim() || validComponents.length === 0) {
      setError(
        "Please fill in the plugin name, description, and at least one component with a name.",
      );
      return;
    }

    execute({
      id: data.id,
      name: name.trim(),
      description: description.trim(),
      logo,
      repository: repositoryLocked
        ? (data.repository ?? null)
        : repository.trim() || null,
      homepage: homepage.trim() || null,
      keywords: keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      // No metadata here: the update action falls back to each component's
      // previously stored metadata when it is omitted.
      components: validComponents.map(draftToComponentInput),
    });
  };

  const formValid =
    name.trim().length >= 2 &&
    description.trim().length >= 10 &&
    components.some((c) => c.name.trim());

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div>
          <span className="mb-1.5 block text-sm font-medium">
            Logo
            <span className="ml-1 font-normal text-muted-foreground">
              (optional)
            </span>
          </span>
          <UploadLogo prefix="plugins" onUpload={setLogo} image={logo} />
        </div>
        <div>
          <label
            htmlFor="edit-plugin-name"
            className="mb-1.5 block text-sm font-medium"
          >
            Name
          </label>
          <Input
            id="edit-plugin-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-border placeholder:text-[#878787]"
          />
        </div>
        <div>
          <label
            htmlFor="edit-plugin-description"
            className="mb-1.5 block text-sm font-medium"
          >
            Description
          </label>
          <Input
            id="edit-plugin-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border-border placeholder:text-[#878787]"
          />
        </div>
        <div>
          <label
            htmlFor="edit-plugin-repository"
            className="mb-1.5 block text-sm font-medium"
          >
            Repository URL
            <span className="ml-1 font-normal text-muted-foreground">
              {repositoryLocked ? "(locked to GitHub source)" : "(optional)"}
            </span>
          </label>
          <Input
            id="edit-plugin-repository"
            value={repository}
            onChange={(e) => !repositoryLocked && setRepository(e.target.value)}
            readOnly={repositoryLocked}
            placeholder="https://github.com/you/your-plugin"
            className="border-border placeholder:text-[#878787] read-only:cursor-not-allowed read-only:opacity-70"
          />
          {repositoryLocked && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              This plugin was imported from GitHub, so the Source link is locked
              to that repository to keep the displayed source consistent with
              the install payload.
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="edit-plugin-homepage"
            className="mb-1.5 block text-sm font-medium"
          >
            Homepage
            <span className="ml-1 font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <Input
            id="edit-plugin-homepage"
            value={homepage}
            onChange={(e) => setHomepage(e.target.value)}
            placeholder="https://your-plugin.dev"
            className="border-border placeholder:text-[#878787]"
          />
        </div>
        <div>
          <label
            htmlFor="edit-plugin-keywords"
            className="mb-1.5 block text-sm font-medium"
          >
            Keywords
            <span className="ml-1 font-normal text-muted-foreground">
              (optional, comma-separated)
            </span>
          </label>
          <Input
            id="edit-plugin-keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="react, typescript, testing"
            className="border-border placeholder:text-[#878787]"
          />
        </div>
      </div>

      <ComponentDraftEditor
        drafts={components}
        onChange={setComponents}
        header={<span className="text-sm font-medium">Components</span>}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <Button
        onClick={onSubmit}
        size="lg"
        disabled={isExecuting || !formValid}
        className="w-full"
      >
        {isExecuting ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            Updating...
          </>
        ) : (
          "Update Plugin"
        )}
      </Button>
    </div>
  );
}
