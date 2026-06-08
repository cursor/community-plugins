"use client";

import { PlusIcon } from "lucide-react";
import Image from "next/image";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

interface UploadLogoProps {
  onUpload?: (url: string) => void;
  prefix: string;
  image?: string | null;
}

export default function UploadLogo({
  onUpload,
  prefix,
  image,
}: UploadLogoProps) {
  const [preview, setPreview] = useState<string | null>(image ?? null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }

    const MAX_FILE_SIZE = 1024 * 1024; // 1MB in bytes
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image must be smaller than 1MB.");
      return;
    }

    const previousPreview = preview;
    setIsUploading(true);

    // Show an optimistic preview while the upload is in flight. It is reverted
    // below if the upload fails so the UI never shows an image that wasn't
    // actually saved.
    let allowReaderPreview = true;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (!allowReaderPreview) return;
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const supabase = createClient();

      // Uploading to the avatars bucket requires an authenticated session. The
      // bucket's row-level security policy only allows the `authenticated`
      // role, so without a session the request is sent as `anon` and Storage
      // rejects it with "new row violates row-level security policy".
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Please sign in to upload an image.");
        allowReaderPreview = false;
        setPreview(previousPreview);
        return;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const path = `${prefix}/${fileName}`;

      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        throw error;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);

      allowReaderPreview = false;
      setPreview(publicUrl);
      onUpload?.(publicUrl);
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload image.",
      );
      allowReaderPreview = false;
      setPreview(previousPreview);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`relative w-[80px] h-[80px] border border-border 
         transition-colors duration-200 cursor-pointer`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleClick();
        }
      }}
      style={{
        backgroundImage: `repeating-linear-gradient(
          -60deg,
          transparent,
          transparent 1px,
          #2C2C2C 1px,
          #2C2C2C 2px,
          transparent 2px,
          transparent 6px
        )`,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInput}
        accept="image/*"
      />

      {preview ? (
        <Image
          src={preview}
          alt="Logo preview"
          fill
          className="object-cover rounded-lg"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-primary">
          <PlusIcon className="size-4" />
        </div>
      )}

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-[10px] font-medium text-white">
          Uploading...
        </div>
      )}
    </div>
  );
}
