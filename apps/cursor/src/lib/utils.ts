import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isImageUrl(url: string): boolean {
  if (!url) return false;
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];

  const isDataUri = url.startsWith("data:image/");

  const isImageExtension =
    imageExtensions.includes(
      url.substring(url.lastIndexOf(".")).toLowerCase(),
    ) || url.endsWith(".svg");

  // Add check for GitHub avatar URLs
  const isGitHubAvatar = url.includes("avatars.githubusercontent.com");

  // Add check for URLs with 'image' in the path or query parameters
  const hasImageInUrl = url.toLowerCase().includes("image");

  return isDataUri || isImageExtension || isGitHubAvatar || hasImageInUrl;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) {
    const k = n / 1_000;
    // 999_950..999_999 rounds to "1000.0" at one decimal; roll it over to "1M" instead of "1000k".
    if (k >= 999.95) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    return `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

export function generateNameAbbr(name: string): string {
  const firstCharRegex = /[\p{L}]/u;

  const match = name.match(firstCharRegex);

  return match ? match[0].toUpperCase() : "";
}

const countryDisplayNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function getCountryName(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  // Only attempt to resolve values that look like ISO 3166-1 alpha-2 codes.
  if (/^[A-Za-z]{2}$/.test(trimmed) && countryDisplayNames) {
    try {
      const name = countryDisplayNames.of(trimmed.toUpperCase());
      if (name && name.toUpperCase() !== trimmed.toUpperCase()) {
        return name;
      }
    } catch {
      // fall through to return original value
    }
  }

  return trimmed;
}
