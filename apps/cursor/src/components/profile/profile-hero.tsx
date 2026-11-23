"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { setProfileImageAction } from "@/actions/set-profile-image";
import { createClient } from "@/utils/supabase/client";

export function ProfileHero({
  userId,
  isOwner,
  hero,
}: {
  userId: string;
  isOwner: boolean;
  hero: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Always reset the input so selecting the same file again triggers change
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image must be smaller than 5MB.");
      return;
    }

    setIsUploading(true);

    try {
      const supabase = createClient();
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const path = `${userId}/hero/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);

      const saved = await setProfileImageAction({
        field: "hero",
        url: publicUrl,
      });

      if (!saved?.data) {
        throw new Error(saved?.serverError ?? "Failed to upload cover image.");
      }

      toast.success("Cover image updated.");
      router.refresh();
    } catch (error) {
      console.error("Error uploading cover image:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to upload cover image.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="relative mb-0 h-[180px] w-full overflow-hidden rounded-xl border border-border bg-card md:h-[220px]"
      style={{
        backgroundImage: !hero
          ? `repeating-linear-gradient(
      -60deg,
      transparent,
      transparent 1px,
      color-mix(in oklab, var(--base) 16%, transparent) 1px,
      color-mix(in oklab, var(--base) 16%, transparent) 2px,
      transparent 2px,
      transparent 6px
    )`
          : "none",
      }}
    >
      {hero && (
        <Image
          src={hero}
          alt="Hero"
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[color:var(--bg-chrome)]/16 via-transparent to-transparent" />
      {isOwner && (
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInput}
          accept="image/*"
        />
      )}

      {isOwner && (
        <button
          aria-label="Change cover image"
          className="absolute right-4 top-4 flex h-9 items-center gap-2 rounded-full border border-border bg-card/92 px-3 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          type="button"
          disabled={isUploading}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={12}
            height={12}
            fill="none"
          >
            <mask
              id="a"
              width={12}
              height={12}
              x={0}
              y={0}
              maskUnits="userSpaceOnUse"
              style={{
                maskType: "alpha",
              }}
            >
              <path fill="#D9D9D9" d="M0 0h12v12H0z" />
            </mask>
            <g mask="url(#a)">
              <path
                fill="currentColor"
                d="M1.5 10.5v-9h5.463l-1 1H2.5v7h7V6.025l1-1V10.5h-9Zm3-3V5.375L9.813.062 11.9 2.2 6.625 7.5H4.5Zm1-1h.7l2.9-2.9-.35-.35-.363-.35L5.5 5.787V6.5Z"
              />
            </g>
          </svg>
          <span className="hidden md:inline">
            {isUploading ? "Uploading..." : "Edit cover"}
          </span>
        </button>
      )}
    </div>
  );
}
