"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { navigationLinks } from "./header";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";

type User = {
  id: string;
  slug: string;
  name?: string;
  image?: string;
};

export function MobileMenu() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    async function getUser() {
      const session = await supabase.auth.getSession();

      if (!session.data.session) {
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("id, slug, name, image")
        .eq("id", session.data.session?.user?.id)
        .single();

      setUser(data);
    }

    if (!user) {
      getUser();
    }
  }, [pathname]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsOpen(false);
  };

  return (
    <>
      <div className="md:hidden mr-4">
        {user ? (
          <Avatar
            className="size-6 rounded-none cursor-pointer"
            onClick={() => setIsOpen(!isOpen)}
          >
            <AvatarImage src={user?.image} className="rounded-none" />
            <AvatarFallback className="rounded-md bg-muted text-xs text-foreground">
              {user?.name?.charAt(0)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <Button
            variant="ghost"
            className="p-0 w-8 h-8"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        )}
      </div>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] bg-background p-4"
            style={{ top: "56px" }}
          >
            <div className="flex flex-col">
              {navigationLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "block rounded-md py-5 text-sm font-medium",
                    link.match(pathname)
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {link.label}
                </Link>
              ))}

              <Link href="/plugins/new" onClick={() => setIsOpen(false)}>
                <Button
                  variant="default"
                  className="mt-6 h-9 w-full rounded-full"
                >
                  Submit a plugin
                </Button>
              </Link>
              <Link href="/bots/new" onClick={() => setIsOpen(false)}>
                <Button
                  variant="outline"
                  className="mt-3 h-9 w-full rounded-full"
                >
                  Submit a bot
                </Button>
              </Link>

              <div className="mt-12">
                {user ? (
                  <>
                    <Link
                      href={`/u/${user?.slug}`}
                      onClick={() => setIsOpen(false)}
                    >
                      <Button
                        variant="outline"
                        className="mb-4 h-9 w-full rounded-full"
                      >
                        Profile
                      </Button>
                    </Link>
                    <Button
                      variant="default"
                      className="h-9 w-full rounded-full"
                      onClick={handleSignOut}
                    >
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    <Button
                      variant="default"
                      className="h-9 w-full rounded-full"
                    >
                      Sign In
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
