"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { updateMCPListingAction } from "@/actions/update-mcp-listing";
import { CompanySelect } from "@/components/company/company-select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "../ui/button";
import UploadLogo from "../upload-logo";

const formSchema = z.object({
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  description: z
    .string()
    .min(10, {
      message: "Description must be at least 10 characters.",
    })
    .max(500, {
      message: "Description must be less than 500 characters.",
    }),
  link: z.string().url({
    message: "Please enter a valid URL.",
  }),
  logo: z.string().optional(),
  company_id: z.string().optional(),
  config: z
    .record(z.string(), z.any(), {
      message: "Config must be a JSON object.",
    })
    .nullable(),
});

type Config = Record<string, unknown>;

/** What the config box holds: nothing, a JSON object, or text that isn't one. */
function parseConfig(text: string): Config | string | null {
  if (!text.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Config;
    }
  } catch {
    // Not JSON (yet): kept as text below, which fails validation.
  }
  return text;
}

export type MCPData = {
  id: string;
  name?: string;
  description?: string;
  link?: string;
  logo?: string;
  company_id: string;
  config?: Config | null;
  active: boolean;
};

export function EditMCPForm({ data }: { data: MCPData }) {
  const { execute, isExecuting } = useAction(updateMCPListingAction, {
    onSuccess: () => {
      toast.success("MCP listing updated successfully");
    },
    onError: () => {
      toast.error("Failed to update MCP listing");
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      company_id: data?.company_id ?? "",
      name: data?.name ?? "",
      description: data?.description ?? "",
      link: data?.link ?? "",
      logo: data?.logo ?? "",
      config: data?.config ?? null,
    },
  });

  // The config as typed. The form field holds the parsed object, so the box
  // can't show that back while someone is still halfway through typing JSON.
  const [configText, setConfigText] = useState(() =>
    data?.config ? JSON.stringify(data.config, null, 2) : "",
  );

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    execute({
      id: data.id,
      // No company picked: leave whatever the listing has.
      company_id: values.company_id || undefined,
      name: values.name,
      description: values.description,
      link: values.link,
      logo: values.logo,
      config: values.config,
    });
  };

  const setLogo = (logo: string) => {
    form.setValue("logo", logo);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-6 pb-6">
          <UploadLogo
            target={{ kind: "mcp-logo" }}
            onUpload={setLogo}
            image={form.watch("logo")}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Resend"
                    {...field}
                    className="placeholder:text-[#878787] border-border"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Write a description..."
                    {...field}
                    className="placeholder:text-[#878787] border-border min-h-[100px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="config"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Config</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Paste your MCP config here"
                    value={configText}
                    onChange={(e) => {
                      setConfigText(e.target.value);
                      field.onChange(parseConfig(e.target.value));
                    }}
                    onBlur={field.onBlur}
                    name={field.name}
                    className="placeholder:text-[#878787] border-border min-h-[100px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="link"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Link to install instructions</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://github.com/resend/resend-mcp"
                    {...field}
                    type="url"
                    className="placeholder:text-[#878787] border-border"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="company_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company</FormLabel>
                <FormControl>
                  <CompanySelect
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isExecuting || !form.formState.isDirty}
        >
          {isExecuting ? "Updating..." : "Update"}
        </Button>
      </form>
    </Form>
  );
}
