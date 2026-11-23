"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { authActionClient } from "./safe-action";

export type CompanySearchResult = {
  id: string;
  name: string;
  slug: string;
  image: string;
  location: string;
};

/**
 * Companies by name (case-insensitive), across the whole table: for the
 * company picker and the "this company already exists" hint.
 */
export const searchCompaniesAction = authActionClient
  .metadata({ actionName: "search-companies" })
  .schema(
    z.object({
      term: z.string().trim().min(1).max(100),
      limit: z.number().int().min(1).max(20),
    }),
  )
  .action(async ({ parsedInput: { term, limit } }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("companies")
      .select("id, name, slug, image, location")
      .ilike("name", `%${term}%`)
      .order("name", { ascending: true })
      .limit(limit);

    const companies: CompanySearchResult[] = (data ?? []).map((company) => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
      image: company.image ?? "",
      location: company.location ?? "",
    }));

    return { companies };
  });

/** The signed-in member's own companies, newest first. */
export const getOwnCompaniesAction = authActionClient
  .metadata({ actionName: "get-own-companies" })
  .action(async ({ ctx: { userId } }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    return { companies: data ?? [] };
  });

/** One company's name, to show a picked company that isn't the member's. */
export const getCompanyNameAction = authActionClient
  .metadata({ actionName: "get-company-name" })
  .schema(z.object({ id: z.string().min(1).max(100) }))
  .action(async ({ parsedInput: { id } }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();

    return { company: data };
  });
