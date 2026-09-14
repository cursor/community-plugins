"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { createBotAction } from "@/actions/create-bot";
import { parseGitHubBotAction } from "@/actions/parse-github-bot";
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
import { Textarea } from "@/components/ui/textarea";
import type { ParsedBot } from "@/lib/bots/parse";
import type { BotNeed } from "@/lib/bots/types";
import { slugify } from "@/lib/slug";

const autoFormSchema = z.object({
  url: z
    .string()
    .url("Please enter a valid URL")
    .regex(/github\.com/, "Must be a GitHub URL"),
});

function parseNeedList(pluginsRaw: string, skillsRaw: string): BotNeed[] {
  const plugins = pluginsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ kind: "plugin" as const, name, slug: slugify(name) }));
  const skills = skillsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ kind: "skill" as const, name }));
  return [...plugins, ...skills];
}

export function BotForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [parsed, setParsed] = useState<ParsedBot | null>(null);
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedWriteup, setEditedWriteup] = useState("");
  const [editedTemplate, setEditedTemplate] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualWriteup, setManualWriteup] = useState("");
  const [manualTemplate, setManualTemplate] = useState("");
  const [manualRepository, setManualRepository] = useState("");
  const [manualPlugins, setManualPlugins] = useState("");
  const [manualSkills, setManualSkills] = useState("");

  const form = useForm<z.infer<typeof autoFormSchema>>({
    resolver: zodResolver(autoFormSchema),
    defaultValues: { url: "" },
  });

  const { execute: executeParse, isExecuting: isParsing } = useAction(
    parseGitHubBotAction,
    {
      onSuccess: ({ data }) => {
        if (data) {
          setParsed(data);
          setEditedName(data.name);
          setEditedDescription(data.description);
          setEditedWriteup(data.writeup);
          setEditedTemplate(data.template);
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
    createBotAction,
    {
      onSuccess: ({ data }) => {
        toast.success("Submitted. It will appear on /bots after review.");
        router.push(data?.slug ? `/bots/${data.slug}` : "/bots");
      },
      onError: ({ error }) => {
        setPublishError(
          error.serverError ?? "Failed to submit bot. Please try again.",
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
    executeCreate({
      name: editedName || parsed.name,
      description: editedDescription || parsed.description,
      writeup: editedWriteup || parsed.writeup,
      template: editedTemplate || parsed.template,
      needs: parsed.needs,
      repository: parsed.repository,
      homepage: parsed.homepage ?? null,
    });
  };

  const onPublishManual = () => {
    setPublishError(null);
    executeCreate({
      name: manualName.trim(),
      description: manualDescription.trim(),
      writeup: manualWriteup.trim(),
      template: manualTemplate.trim(),
      needs: parseNeedList(manualPlugins, manualSkills),
      repository: manualRepository.trim() || null,
    });
  };

  return (
    <div className="space-y-6">
      <Tabs
        value={mode}
        onValueChange={(v) => {
          if (v !== "auto" && v !== "manual") return;
          setMode(v);
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
                            placeholder="https://github.com/you/your-bot"
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
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
              <p className="text-sm text-red-400">{parseError}</p>
            </div>
          )}

          {parsed && (
            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="auto-bot-name"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Name
                </label>
                <Input
                  id="auto-bot-name"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="auto-bot-description"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Description
                </label>
                <Input
                  id="auto-bot-description"
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="auto-bot-writeup"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Use-case writeup
                </label>
                <Textarea
                  id="auto-bot-writeup"
                  value={editedWriteup}
                  onChange={(e) => setEditedWriteup(e.target.value)}
                  className="min-h-32"
                />
              </div>
              <div>
                <label
                  htmlFor="auto-bot-template"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Template
                </label>
                <Textarea
                  id="auto-bot-template"
                  value={editedTemplate}
                  onChange={(e) => setEditedTemplate(e.target.value)}
                  className="min-h-32 font-mono text-sm"
                />
              </div>
              {parsed.needs.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Detected needs:{" "}
                  {parsed.needs
                    .map((n) =>
                      n.kind === "plugin"
                        ? `plugin ${n.name}`
                        : `skill ${n.name}`,
                    )
                    .join(", ")}
                </p>
              )}
              {publishError && (
                <p className="text-sm text-red-400">{publishError}</p>
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
                    Submitting...
                  </>
                ) : (
                  "Submit bot"
                )}
              </Button>
            </div>
          )}

          {!parsed && !parseError && (
            <p className="pt-4 text-center text-xs text-muted-foreground">
              We look for bot.json or BOT.md plus a writeup. Open Plugins
              agents/*.md files are plugins. Submit those at /plugins/new.
            </p>
          )}
        </TabsContent>

        <TabsContent value="manual" className="mt-6 space-y-4">
          <Input
            placeholder="Name"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
          />
          <Input
            placeholder="Short description"
            value={manualDescription}
            onChange={(e) => setManualDescription(e.target.value)}
          />
          <Textarea
            placeholder="Use-case writeup (this is the SEO page body)"
            value={manualWriteup}
            onChange={(e) => setManualWriteup(e.target.value)}
            className="min-h-32"
          />
          <Textarea
            placeholder="Copyable bot template"
            value={manualTemplate}
            onChange={(e) => setManualTemplate(e.target.value)}
            className="min-h-32 font-mono text-sm"
          />
          <Input
            placeholder="GitHub repo URL (optional)"
            value={manualRepository}
            onChange={(e) => setManualRepository(e.target.value)}
          />
          <Input
            placeholder="Plugin names, comma-separated"
            value={manualPlugins}
            onChange={(e) => setManualPlugins(e.target.value)}
          />
          <Input
            placeholder="Skill names, comma-separated"
            value={manualSkills}
            onChange={(e) => setManualSkills(e.target.value)}
          />
          {publishError && (
            <p className="text-sm text-red-400">{publishError}</p>
          )}
          <Button
            onClick={onPublishManual}
            size="lg"
            disabled={
              isCreating ||
              manualName.trim().length < 2 ||
              manualDescription.trim().length < 10 ||
              manualWriteup.trim().length < 40 ||
              manualTemplate.trim().length < 20
            }
            className="w-full"
          >
            {isCreating ? "Submitting..." : "Submit bot"}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
