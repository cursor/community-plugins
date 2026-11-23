"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { getSession } from "@/utils/supabase/auth";
import { actionClient } from "./safe-action";

/** Whether the signed-in member follows this profile. */
export const getFollowStatusAction = actionClient
  .metadata({ actionName: "get-follow-status" })
  .schema(z.object({ userId: z.string().uuid() }))
  .action(async ({ parsedInput: { userId } }) => {
    const session = await getSession();
    if (!session) return { following: false };

    const supabase = await createClient();
    const { data } = await supabase
      .from("followers")
      .select("id")
      .eq("follower_id", session.user.id)
      .eq("following_id", userId)
      .maybeSingle();

    return { following: !!data };
  });
