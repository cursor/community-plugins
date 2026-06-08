"use client";

import { usePathname, useRouter } from "next/navigation";
import { parseAsBoolean, useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "../ui/button";

export function AddCompanyButton({ redirect }: { redirect?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const [_, setAddCompany] = useQueryStates({
    addCompany: parseAsBoolean.withDefault(false),
    redirect: parseAsBoolean.withDefault(redirect ?? false),
  });

  useEffect(() => {
    async function getUser() {
      const session = await supabase.auth.getSession();

      setIsAuthenticated(Boolean(session.data.session));
    }

    getUser();
  }, []);

  const handleClick = () => {
    // Adding a company requires an authenticated session: the save action is
    // auth-guarded and the logo upload hits an auth-only storage policy. Send
    // signed-out visitors to sign in instead of into a form that can't succeed.
    if (isAuthenticated === false) {
      router.push(`/login?next=${pathname}`);
      return;
    }

    if (isAuthenticated === null) {
      return;
    }

    setAddCompany({ addCompany: true, redirect });
  };

  return (
    <Button type="button" variant="outline" size="lg" onClick={handleClick}>
      Add company
    </Button>
  );
}
