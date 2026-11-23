"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { nanoid } from "nanoid";
import { useAction } from "next-safe-action/hooks";
import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  type CompanySearchResult,
  searchCompaniesAction,
} from "@/actions/company-lookup";
import { upsertCompanyAction } from "@/actions/upsert-company";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import UploadLogo from "../upload-logo";

const formSchema = z.object({
  name: z
    .string()
    .min(2, {
      message: "Name must be at least 2 characters.",
    })
    .max(50, {
      message: "Name must be less than 50 characters.",
    }),
  location: z
    .string()
    .max(100, {
      message: "Location must be less than 100 characters.",
    })
    .optional(),
  bio: z
    .string()
    .max(500, {
      message: "Bio must be less than 500 characters.",
    })
    .optional(),
  website: z
    .string()
    .url({ message: "Please enter a valid website URL." })
    .or(z.literal("")),
  social_x_link: z
    .string()
    .url({ message: "Please enter a valid X URL." })
    .or(z.literal("")),
  is_public: z.boolean().optional(),
  image: z.string().url().nullable(),
});

type CompanyData = {
  id: string;
  name?: string;
  location?: string;
  bio?: string;
  website?: string;
  social_x_link?: string;
  public?: boolean;
  image?: string;
};

export function CompanyForm({
  data,
  redirect,
}: {
  data?: CompanyData;
  redirect?: boolean;
}) {
  const [, setQueryStates] = useQueryStates({
    reload: parseAsBoolean.withDefault(false),
    addCompany: parseAsBoolean.withDefault(false),
    // Channel used to report the chosen company back to the calling selector
    // (e.g. the MCP form's CompanySelect).
    pickedCompany: parseAsString,
  });

  // Existing-company suggestions for the name field, so users can reuse a
  // company that's already on the directory instead of creating a duplicate.
  const isNewCompany = !data?.id;
  const [suggestions, setSuggestions] = useState<CompanySearchResult[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const { execute, isExecuting } = useAction(upsertCompanyAction, {
    onSuccess: ({ data: result }) => {
      if (!redirect) {
        // Select the new (or reused) company into the calling form, refresh the
        // owned-company list, and close the modal.
        setQueryStates({
          reload: true,
          pickedCompany: result?.id ?? null,
          addCompany: false,
        });
      }
    },
  });

  // Generate the id once per mount. Recomputing it on every render would change
  // the submitted id (and logo upload path) and defeat duplicate prevention.
  const [id] = useState(() => data?.id ?? nanoid());

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: data?.name,
      location: data?.location ?? "",
      bio: data?.bio ?? "",
      website: data?.website ?? "",
      social_x_link: data?.social_x_link ?? "",
      is_public: data?.public ?? true,
      image: data?.image ?? null,
    },
  });

  const nameValue = form.watch("name");

  useEffect(() => {
    if (!isNewCompany) {
      return;
    }

    const term = (nameValue ?? "").trim();

    if (term.length < 2) {
      setSuggestions([]);
      return;
    }

    let active = true;
    const handle = setTimeout(async () => {
      const result = await searchCompaniesAction({ term, limit: 5 });
      if (active) {
        setSuggestions(result?.data?.companies ?? []);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [nameValue, isNewCompany]);

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    execute({
      id,
      name: data.name,
      location: data.location || null,
      bio: data.bio || null,
      website: data.website || null,
      social_x_link: data.social_x_link || null,
      is_public: data.is_public ?? true,
      image: data.image || null,
      redirect,
    });
  };

  const handleImageUpload = (url: string) => {
    form.setValue("image", url);
  };

  const handleSuggestionSelect = (company: CompanySearchResult) => {
    setSuggestions([]);
    setSuggestionsOpen(false);

    if (redirect) {
      // Profile / browse context: complete the name field with the chosen
      // company instead of navigating away.
      form.setValue("name", company.name, {
        shouldValidate: true,
        shouldDirty: true,
      });
      return;
    }

    // Selector context (e.g. the MCP form): pick the existing company instead
    // of creating a duplicate, then close the modal.
    setQueryStates({ pickedCompany: company.id, addCompany: false });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <ScrollArea className="h-[450px] pr-4">
          <div className="space-y-6">
            <UploadLogo
              onUpload={handleImageUpload}
              target={{ kind: "company-logo", companyId: id }}
              image={data?.image}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="Your company name"
                        {...field}
                        autoComplete="off"
                        onFocus={() => setSuggestionsOpen(true)}
                        onBlur={() => {
                          field.onBlur();
                          // Delay so a suggestion click registers before hiding.
                          setTimeout(() => setSuggestionsOpen(false), 150);
                        }}
                        className="placeholder:text-[#878787] border-border"
                      />

                      {isNewCompany &&
                        suggestionsOpen &&
                        suggestions.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
                            <div className="px-3 py-2 text-xs text-[#878787]">
                              Already on Cursor Directory
                            </div>
                            <ul className="max-h-[200px] overflow-y-auto">
                              {suggestions.map((company) => (
                                <li key={company.id}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() =>
                                      handleSuggestionSelect(company)
                                    }
                                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                                  >
                                    <span className="font-medium text-foreground">
                                      {company.name}
                                    </span>
                                    {company.location && (
                                      <span className="text-xs text-[#878787]">
                                        {company.location}
                                      </span>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Company location"
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
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Company bio"
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
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://your-website.com"
                      {...field}
                      type="url"
                      value={field.value || ""}
                      className="placeholder:text-[#878787] border-border"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="social_x_link"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>X Profile</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://x.com/your-profile"
                      {...field}
                      type="url"
                      value={field.value || ""}
                      className="placeholder:text-[#878787] border-border"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_public"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between border border-border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm">Public Profile</FormLabel>
                    <p className="text-xs text-[#878787]">
                      Make your company visible to everyone
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </ScrollArea>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isExecuting}
        >
          {isExecuting ? "Saving..." : "Save Company"}
        </Button>
      </form>
    </Form>
  );
}
