"use client";

import { useAction } from "next-safe-action/hooks";
import { useEffect, useState } from "react";
import { getFollowStatusAction } from "@/actions/get-follow-status";
import { toggleFollowAction } from "@/actions/toggle-follow-action";
import { isAuthenticated as isAuthenticatedClient } from "@/utils/supabase/client-session";
import { SignInModal } from "../modals/sign-in-modal";
import { Button } from "../ui/button";

type Props = {
  slug: string;
  id: string;
};

export function FollowButton({ slug, id }: Props) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const followAction = useAction(toggleFollowAction);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    setIsAuthenticated(isAuthenticatedClient());
  }, []);

  useEffect(() => {
    let active = true;

    const fetchIsFollowing = async () => {
      setIsFollowing(false);
      if (!isAuthenticatedClient()) return;

      const result = await getFollowStatusAction({ userId: id });

      if (active && result?.data?.following) {
        setIsFollowing(true);
      }
    };

    fetchIsFollowing();

    return () => {
      active = false;
    };
  }, [id]);

  const handleFollow = () => {
    if (!isAuthenticated) {
      setIsSignInModalOpen(true);
      return;
    }

    followAction.execute({
      userId: id,
      action: isFollowing ? "unfollow" : "follow",
      slug,
    });

    setIsFollowing(!isFollowing);
  };

  return (
    <>
      <Button
        size="lg"
        className="min-w-[124px]"
        onClick={handleFollow}
        variant={isFollowing ? "outline" : "default"}
        disabled={followAction.isExecuting}
      >
        {isFollowing ? "Following" : "Follow"}
      </Button>
      <SignInModal
        redirectTo={`/u/${slug}`}
        isOpen={isSignInModalOpen}
        setIsOpen={setIsSignInModalOpen}
      />
    </>
  );
}
