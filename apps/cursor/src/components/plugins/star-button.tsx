"use client";

import { Star } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useEffect, useRef, useState } from "react";
import { getStarStatusAction } from "@/actions/get-star-status";
import { starPluginAction } from "@/actions/star-plugin";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { SignInModal } from "../modals/sign-in-modal";
import { Button } from "../ui/button";

export function StarButton({
  pluginId,
  slug,
  starCount,
}: {
  pluginId: string;
  slug: string;
  starCount: number;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [starred, setStarred] = useState(false);
  const [count, setCount] = useState(starCount);
  const [loaded, setLoaded] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const prevRef = useRef({ starred: false, count: starCount });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setLoaded(true);
        return;
      }
      setIsAuthenticated(true);
      getStarStatusAction({ pluginId }).then((result) => {
        const isStarred = result?.data?.starred === true;
        setStarred(isStarred);
        prevRef.current = { starred: isStarred, count: starCount };
        setLoaded(true);
      });
    });
  }, [pluginId, starCount]);

  const { execute } = useAction(starPluginAction, {
    onError: () => {
      setStarred(prevRef.current.starred);
      setCount(prevRef.current.count);
    },
  });

  const handleClick = () => {
    if (!isAuthenticated) {
      setIsSignInModalOpen(true);
      return;
    }

    prevRef.current = { starred, count };
    setStarred(!starred);
    setCount(starred ? count - 1 : count + 1);
    execute({ pluginId, slug });
  };

  if (!loaded) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 rounded-full border-border bg-card"
        disabled
      >
        <Star className="size-3.5" />
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "gap-1.5 rounded-full border-border bg-card",
          starred && "text-yellow-500",
        )}
        onClick={handleClick}
      >
        <Star className={cn("size-3.5", starred && "fill-yellow-500")} />
      </Button>

      <SignInModal
        isOpen={isSignInModalOpen}
        setIsOpen={setIsSignInModalOpen}
        redirectTo={`/plugins/${slug}`}
      />
    </>
  );
}
