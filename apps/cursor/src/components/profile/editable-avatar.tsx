"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { setProfileImageAction } from "@/actions/set-profile-image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/utils/supabase/client";

export function EditableAvatar({
  userId,
  name,
  image,
  isOwner,
}: {
  userId: string;
  name: string;
  image?: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      const path = `${userId}/avatar/${fileName}`;

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
        field: "image",
        url: publicUrl,
      });

      if (!saved?.data) {
        throw new Error(
          saved?.serverError ?? "Failed to upload profile image.",
        );
      }

      toast.success("Profile image updated.");
      router.refresh();
    } catch (error) {
      console.error("Error uploading profile image:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to upload profile image.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const openPicker = () => fileInputRef.current?.click();

  const avatar = (
    <Avatar className="size-20 border border-border bg-card md:size-24">
      <AvatarImage src={image} className="object-cover" />
      <AvatarFallback className="bg-muted text-lg font-medium text-foreground">
        {name?.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );

  if (!isOwner) {
    return avatar;
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInput}
        accept="image/*"
      />

      <button
        type="button"
        onClick={openPicker}
        disabled={isUploading}
        aria-label="Change profile image"
        className="group relative rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {avatar}

        <span
          className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs font-medium text-white transition-opacity ${
            isUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {isUploading ? "Uploading..." : "Change"}
        </span>
      </button>
    </div>
  );
}
