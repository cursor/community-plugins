"use server";

import { revalidateTag, updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { authActionClient } from "./safe-action";

export const toggleFollowAction = authActionClient
  .metadata({
    actionName: "toggle-follow",
  })
  .schema(
    z.object({
      action: z.enum(["follow", "unfollow"]),
      userId: z.string().uuid(),
      slug: z.string(),
    }),
  )
  .action(
    async ({
      parsedInput: { userId, action, slug },
      ctx: { userId: currentUserId },
    }) => {
      const supabase = await createClient();

      const invalidate = () => {
        // Profile follower counts, the followed user's followers list, and
        // the current user's following list must all reflect the change.
        updateTag(`user-${slug}`);
        updateTag(`followers-${userId}`);
        updateTag(`following-${currentUserId}`);
        // The members directory caches rows (incl. follower_count) under
        // `users`. Background-refresh it like other ambient counters
        // (see star-plugin) instead of synchronously flushing every
        // users-tagged entry on each follow click.
        revalidateTag("users", "max");
      };

      if (action === "follow") {
        const { error } = await supabase
          .from("followers")
          .insert({ follower_id: currentUserId, following_id: userId });

        if (error) {
          throw new Error(error.message);
        }

        invalidate();
        return;
      }

      if (action === "unfollow") {
        await supabase
          .from("followers")
          .delete()
          .eq("follower_id", currentUserId)
          .eq("following_id", userId);
      }

      invalidate();
    },
  );
