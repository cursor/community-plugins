"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import {
  getCompanyNameAction,
  getOwnCompaniesAction,
  searchCompaniesAction,
} from "@/actions/company-lookup";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AddCompanyButton } from "./add-company-button";

type Company = {
  id: string;
  name: string;
};

export function CompanySelect({
  onChange,
  value,
}: {
  value?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Company | null>(null);
  const [ownCompanies, setOwnCompanies] = useState<Company[]>([]);
  const [results, setResults] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  const [{ reload, pickedCompany }, setQueryStates] = useQueryStates({
    reload: parseAsBoolean.withDefault(false),
    addCompany: parseAsBoolean.withDefault(false),
    pickedCompany: parseAsString,
  });

  // Load the current user's own companies (shown first). Re-runs when a new
  // company is added via the "Add company" modal (which flips `reload`).
  useEffect(() => {
    let active = true;

    async function loadOwn() {
      const result = await getOwnCompaniesAction();
      const companies = result?.data?.companies;

      if (active && companies) {
        setOwnCompanies(companies);
      }
    }

    loadOwn();

    if (reload) {
      setQueryStates({ reload: false, addCompany: false });
    }

    return () => {
      active = false;
    };
  }, [reload, setQueryStates]);

  // The "Add company" modal reports the chosen company (an existing match or a
  // freshly created one) via `pickedCompany`. Select it into this field.
  useEffect(() => {
    if (!pickedCompany) {
      return;
    }

    onChange(pickedCompany);
    setQueryStates({ pickedCompany: null });
  }, [pickedCompany, onChange, setQueryStates]);

  // Resolve the display name for the currently selected company id, even when
  // it was created by someone else and isn't in the user's own list.
  useEffect(() => {
    let active = true;

    if (!value) {
      setSelected(null);
      return;
    }

    const known =
      ownCompanies.find((c) => c.id === value) ??
      results.find((c) => c.id === value);

    if (known) {
      setSelected(known);
      return;
    }

    async function resolve(id: string) {
      const result = await getCompanyNameAction({ id });
      const company = result?.data?.company;

      if (active && company) {
        setSelected(company);
      }
    }

    resolve(value);

    return () => {
      active = false;
    };
  }, [value, ownCompanies, results]);

  // Debounced search across all companies by name.
  useEffect(() => {
    const term = query.trim();

    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }

    setResults([]);
    let active = true;
    setLoading(true);

    const handle = setTimeout(async () => {
      const result = await searchCompaniesAction({ term, limit: 20 });

      if (active) {
        setResults(result?.data?.companies ?? []);
        setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  const handleSelect = (company: Company) => {
    setSelected(company);
    onChange(company.id);
    setQuery("");
    setOpen(false);
  };

  const term = query.trim().toLowerCase();
  const ownFiltered = term
    ? ownCompanies.filter((c) => c.name.toLowerCase().includes(term))
    : ownCompanies;
  const ownIds = new Set(ownFiltered.map((c) => c.id));
  const otherResults = results.filter((c) => !ownIds.has(c.id));

  return (
    <div className="flex items-center gap-4">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between border-border font-normal"
          >
            <span className={cn("truncate", !selected && "text-[#878787]")}>
              {selected?.name ?? "Select company"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search companies..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {loading
                  ? "Searching..."
                  : term
                    ? "No companies found."
                    : "Type to search companies."}
              </CommandEmpty>

              {ownFiltered.length > 0 && (
                <CommandGroup heading="Your companies">
                  {ownFiltered.map((company) => (
                    <CommandItem
                      key={company.id}
                      value={company.id}
                      onSelect={() => handleSelect(company)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === company.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{company.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {otherResults.length > 0 && (
                <CommandGroup heading="All companies">
                  {otherResults.map((company) => (
                    <CommandItem
                      key={company.id}
                      value={company.id}
                      onSelect={() => handleSelect(company)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === company.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{company.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <AddCompanyButton redirect={false} />
    </div>
  );
}
