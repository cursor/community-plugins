"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { createPluginAction } from "@/actions/create-plugin";
import { parseGitHubPluginAction } from "@/actions/parse-github-plugin";
import { GithubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ComponentType } from "@/lib/plugins/types";
import UploadLogo from "../upload-logo";
import {
  type ComponentDraft,
  ComponentDraftEditor,
  draftToComponentInput,
  newComponentDraft,
} from "./component-draft-editor";

type ParsedComponent = {
  type: string;
  name: string;
  slug: string;
  description?: string;
  content?: string;
  metadata: Record<string, unknown>;
};

type ParsedPlugin = {
  name: string;
  description: string;
  version?: string;
  logo?: string;
  homepage?: string;
  repository: string;
  license?: string;
  keywords: string[];
  author_name?: string;
  author_url?: string;
  author_avatar?: string;
  github_repo_id?: number;
  components: ParsedComponent[];
};

const autoFormSchema = z.object({
  url: z
    .string()
    .url("Please enter a valid URL")
    .regex(/github\.com/, "Must be a GitHub URL"),
});

function publishableComponents(drafts: ComponentDraft[]) {
  return drafts
    .filter((c) => c.name.trim())
    .map((draft) => ({ ...draftToComponentInput(draft), metadata: {} }));
}

export function PluginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"auto" | "manual">("auto");

  const [parsed, setParsed] = useState<ParsedPlugin | null>(null);
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [editedComponents, setEditedComponents] = useState<ComponentDraft[]>(
    [],
  );

  const [autoLogo, setAutoLogo] = useState<string | null>(null);

  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualLogo, setManualLogo] = useState<string | null>(null);
  const [manualRepository, setManualRepository] = useState("");
  const [manualHomepage, setManualHomepage] = useState("");
  const [manualKeywords, setManualKeywords] = useState("");
  const [manualComponents, setManualComponents] = useState<ComponentDraft[]>([
    newComponentDraft(),
  ]);

  const form = useForm<z.infer<typeof autoFormSchema>>({
    resolver: zodResolver(autoFormSchema),
    defaultValues: { url: "" },
  });

  const { execute: executeParse, isExecuting: isParsing } = useAction(
    parseGitHubPluginAction,
    {
      onSuccess: ({ data }) => {
        if (data) {
          setParsed(data);
          setEditedName(data.name);
          setEditedDescription(data.description);
          setEditedComponents(
            data.components.map((c) => ({
              id: crypto.randomUUID(),
              type: c.type as ComponentType,
              slug: c.slug,
              name: c.name,
              description: c.description ?? "",
              content: c.content ?? "",
            })),
          );
          setParseError(null);
        }
      },
      onError: ({ error }) => {
        setParseError(error.serverError ?? "Failed to parse repository");
        setParsed(null);
      },
    },
  );

  const { execute: executeCreate, isExecuting: isCreating } = useAction(
    createPluginAction,
    {
      onSuccess: ({ data }) => {
        toast.success(
          "Submitted! Scanning your plugin now — it will appear shortly.",
        );
        router.push(data?.slug ? `/plugins/${data.slug}` : "/");
      },
      onError: ({ error }) => {
        setPublishError(
          error.serverError ?? "Failed to publish plugin. Please try again.",
        );
      },
    },
  );

  const onParse = (values: z.infer<typeof autoFormSchema>) => {
    setParseError(null);
    setPublishError(null);
    setParsed(null);
    executeParse({ url: values.url });
  };

  const onPublishAuto = () => {
    if (!parsed) return;
    setPublishError(null);

    const components = publishableComponents(editedComponents);
    if (components.length === 0) {
      setPublishError("At least one component with a name is required.");
      return;
    }

    executeCreate({
      name: editedName || parsed.name,
      description: editedDescription || parsed.description,
      logo: autoLogo ?? parsed.logo ?? null,
      repository: parsed.repository,
      homepage: parsed.homepage ?? null,
      keywords: parsed.keywords,
      components,
    });
  };

  const onPublishManual = () => {
    setPublishError(null);

    const components = publishableComponents(manualComponents);
    if (
      !manualName.trim() ||
      !manualDescription.trim() ||
      components.length === 0
    ) {
      setPublishError(
        "Please fill in the plugin name, description, and at least one component with a name.",
      );
      return;
    }

    executeCreate({
      name: manualName.trim(),
      description: manualDescription.trim(),
      logo: manualLogo,
      repository: manualRepository.trim() || null,
      homepage: manualHomepage.trim() || null,
      keywords: manualKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      components,
    });
  };

  const manualFormValid =
    manualName.trim().length >= 2 &&
    manualDescription.trim().length >= 10 &&
    manualComponents.some((c) => c.name.trim());

  return (
    <div className="space-y-6">
      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode(v as "auto" | "manual");
          setPublishError(null);
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="auto" className="flex-1">
            Auto (GitHub)
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex-1">
            Manual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="auto" className="mt-6">
          <div className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onParse)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <GithubIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="https://github.com/you/your-plugin"
                              {...field}
                              className="border-border pl-10 placeholder:text-[#878787]"
                              disabled={isParsing}
                            />
                          </div>
                          <Button
                            type="submit"
                            disabled={isParsing}
                            className="h-11 flex-shrink-0"
                          >
                            {isParsing ? (
                              <>
                                <Loader2 className="size-4 animate-spin mr-2" />
                                Scanning...
                              </>
                            ) : parsed ? (
                              "Re-scan"
                            ) : (
                              "Scan repo"
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>

            {parseError && (
              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                <div className="text-sm text-red-400">
                  <p>{parseError}</p>
                </div>
              </div>
            )}

            {parsed && (
              <div className="space-y-6">
                <div className="space-y-6">
                  <div>
                    <span className="mb-1.5 block text-sm font-medium">
                      Logo
                      <span className="ml-1 font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </span>
                    <UploadLogo
                      prefix="plugins"
                      onUpload={setAutoLogo}
                      image={autoLogo ?? parsed.logo}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="auto-plugin-name"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Name
                    </label>
                    <Input
                      id="auto-plugin-name"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="border-border placeholder:text-[#878787]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="auto-plugin-description"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Description
                    </label>
                    <Input
                      id="auto-plugin-description"
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="border-border placeholder:text-[#878787]"
                    />
                  </div>
                  {parsed.author_name && (
                    <p className="text-xs text-muted-foreground">
                      by {parsed.author_name}
                    </p>
                  )}
                  {parsed.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {parsed.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <ComponentDraftEditor
                  drafts={editedComponents}
                  onChange={setEditedComponents}
                  header={
                    <div className="flex items-center gap-2">
                      <Check className="size-3.5 text-emerald-500" />
                      <p className="text-sm text-muted-foreground">
                        {editedComponents.length}{" "}
                        {editedComponents.length === 1
                          ? "component"
                          : "components"}
                      </p>
                    </div>
                  }
                />

                {publishError && (
                  <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                    <p className="text-sm text-red-400">{publishError}</p>
                  </div>
                )}

                <Button
                  onClick={onPublishAuto}
                  size="lg"
                  disabled={isCreating || !editedName.trim()}
                  className="w-full"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Publishing...
                    </>
                  ) : (
                    "Publish Plugin"
                  )}
                </Button>
              </div>
            )}

            {!parsed && !parseError && (
              <p className="text-center text-xs text-muted-foreground pt-2">
                We&apos;ll scan for rules, MCP servers, skills, agents, and more
                following the{" "}
                <a
                  href="https://agent-plugins.org"
                  target="_blank"
                  rel="noreferrer"
                  className="border-b border-border border-dashed hover:text-foreground transition-colors"
                >
                  Open Plugins
                </a>{" "}
                standard.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="manual" className="mt-6">
          <div className="space-y-6">
            <div className="space-y-6">
              <div>
                <span className="mb-1.5 block text-sm font-medium">
                  Logo
                  <span className="ml-1 font-normal text-muted-foreground">
                    (optional)
                  </span>
                </span>
                <UploadLogo
                  prefix="plugins"
                  onUpload={setManualLogo}
                  image={manualLogo}
                />
              </div>
              <div>
                <label
                  htmlFor="manual-plugin-name"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Name
                </label>
                <Input
                  id="manual-plugin-name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="My Plugin"
                  className="border-border placeholder:text-[#878787]"
                />
              </div>
              <div>
                <label
                  htmlFor="manual-plugin-description"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Description
                </label>
                <Input
                  id="manual-plugin-description"
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="A short description of what this plugin does"
                  className="border-border placeholder:text-[#878787]"
                />
              </div>
              <div>
                <label
                  htmlFor="manual-plugin-repository"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Repository URL
                  <span className="ml-1 font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <Input
                  id="manual-plugin-repository"
                  value={manualRepository}
                  onChange={(e) => setManualRepository(e.target.value)}
                  placeholder="https://github.com/you/your-plugin"
                  className="border-border placeholder:text-[#878787]"
                />
              </div>
              <div>
                <label
                  htmlFor="manual-plugin-homepage"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Homepage
                  <span className="ml-1 font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <Input
                  id="manual-plugin-homepage"
                  value={manualHomepage}
                  onChange={(e) => setManualHomepage(e.target.value)}
                  placeholder="https://your-plugin.dev"
                  className="border-border placeholder:text-[#878787]"
                />
              </div>
              <div>
                <label
                  htmlFor="manual-plugin-keywords"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Keywords
                  <span className="ml-1 font-normal text-muted-foreground">
                    (optional, comma-separated)
                  </span>
                </label>
                <Input
                  id="manual-plugin-keywords"
                  value={manualKeywords}
                  onChange={(e) => setManualKeywords(e.target.value)}
                  placeholder="react, typescript, testing"
                  className="border-border placeholder:text-[#878787]"
                />
              </div>
            </div>

            <ComponentDraftEditor
              drafts={manualComponents}
              onChange={setManualComponents}
              header={<span className="text-sm font-medium">Components</span>}
            />

            {publishError && (
              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                <p className="text-sm text-red-400">{publishError}</p>
              </div>
            )}

            <Button
              onClick={onPublishManual}
              size="lg"
              disabled={isCreating || !manualFormValid}
              className="w-full"
            >
              {isCreating ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Publishing...
                </>
              ) : (
                "Publish Plugin"
              )}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
