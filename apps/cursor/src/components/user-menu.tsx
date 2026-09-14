"use client";

import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { parseAsBoolean, useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Skeleton } from "./ui/skeleton";

type User = {
  id: string;
  slug: string;
  name?: string;
  image?: string;
};

export function UserMenu() {
  const pathname = usePathname();
  const supabase = createClient();
  const { setTheme, theme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [_, setQueryStates] = useQueryStates({
    addCompany: parseAsBoolean.withDefault(false),
    redirect: parseAsBoolean.withDefault(false),
  });

  useEffect(() => {
    async function getUser() {
      setIsLoading(true);
      const session = await supabase.auth.getSession();

      if (!session.data.session) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("id, slug, name, image")
        .eq("id", session.data.session?.user?.id)
        .single();

      setUser(data);
      setIsLoading(false);
    }

    if (!user) {
      getUser();
    }
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-none" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-4"
    >
      {user ? (
        <div className="flex items-center gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Avatar className="size-6 rounded-none cursor-pointer">
                <AvatarImage src={user?.image} className="rounded-none" />
                <AvatarFallback className="rounded-md bg-muted text-xs text-foreground">
                  {user?.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-32"
              side="bottom"
              sideOffset={8}
            >
              <DropdownMenuItem asChild>
                <Link href={`/u/${user?.slug}`}>Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button
                  type="button"
                  onClick={() =>
                    setQueryStates({ addCompany: true, redirect: true })
                  }
                  className="w-full text-left"
                >
                  Add Company
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/plugins/new">Submit a plugin</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/bots/new">Submit a bot</Link>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Theme</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setTheme("light")}>
                      <Sun className="mr-2 size-3.5" />
                      Light
                      {theme === "light" && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          ✓
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")}>
                      <Moon className="mr-2 size-3.5" />
                      Dark
                      {theme === "dark" && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          ✓
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")}>
                      <Monitor className="mr-2 size-3.5" />
                      System
                      {theme === "system" && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          ✓
                        </span>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={handleSignOut}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <Link href={`/login?next=${pathname}`}>
          <Button variant="default" className="h-8 rounded-full">
            Sign In
          </Button>
        </Link>
      )}
    </motion.div>
  );
}
