"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { ActionError, authActionClient } from "./safe-action";

const BUCKET = "avatars";
const EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "jfif",
  "webp",
  "gif",
  "svg",
  "avif",
  "ico",
]);

const companyId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("avatar") }),
  z.object({ kind: z.literal("cover") }),
  z.object({ kind: z.literal("plugin-logo") }),
  z.object({ kind: z.literal("mcp-logo") }),
  z.object({ kind: z.literal("company-cover"), companyId }),
  z.object({ kind: z.literal("company-logo"), companyId }),
]);

export type UploadTarget = z.infer<typeof target>;

/**
 * Where a signed-in member may put one picture, and a one-time token to put
 * it there.
 *
 * Members can't write to storage themselves. The server picks the folder (the
 * member's own, or a company's they own) and the file name, and storage takes
 * one upload to exactly that address.
 */
export const createUploadUrlAction = authActionClient
  .metadata({ actionName: "create-upload-url" })
  .schema(z.object({ target, fileName: z.string().min(1).max(300) }))
  .action(async ({ parsedInput: { target, fileName }, ctx: { userId } }) => {
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONS.has(extension)) {
      throw new ActionError("Please select an image file.");
    }

    const supabase = await createClient();
    const folder = await folderFor(supabase, target, userId);
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;

    const storage = supabase.storage.from(BUCKET);
    const { data, error } = await storage.createSignedUploadUrl(path);
    if (error || !data) {
      throw new ActionError("Failed to upload image.");
    }

    return {
      path: data.path,
      token: data.token,
      publicUrl: storage.getPublicUrl(path).data.publicUrl,
    };
  });

async function folderFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  target: UploadTarget,
  userId: string,
): Promise<string> {
  switch (target.kind) {
    case "avatar":
      return `${userId}/avatar`;
    case "cover":
      return `${userId}/hero`;
    case "plugin-logo":
      return "plugins";
    case "mcp-logo":
      return "mcp";
    case "company-cover":
    case "company-logo": {
      // A new company's form uploads its logo before the company is saved,
      // so a company that doesn't exist yet is fine; someone else's isn't.
      const { data: company } = await supabase
        .from("companies")
        .select("owner_id")
        .eq("id", target.companyId)
        .maybeSingle();
      if (
        company ? company.owner_id !== userId : target.kind !== "company-logo"
      ) {
        throw new ActionError("You don't have permission to edit this company");
      }
      return target.kind === "company-cover"
        ? `${target.companyId}/hero`
        : `company/${target.companyId}`;
    }
    default: {
      const unknown: never = target;
      throw new ActionError(`Unknown upload: ${JSON.stringify(unknown)}`);
    }
  }
}
