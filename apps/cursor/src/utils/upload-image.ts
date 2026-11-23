import {
  createUploadUrlAction,
  type UploadTarget,
} from "@/actions/create-upload-url";
import { createClient } from "@/utils/supabase/client";

/**
 * Uploads a picture from the browser and returns its public address.
 *
 * The server says where the picture goes and hands back a one-time token for
 * that address; the file itself goes straight to storage with it.
 */
export async function uploadImage(
  file: File,
  target: UploadTarget,
): Promise<string> {
  const result = await createUploadUrlAction({ target, fileName: file.name });
  if (!result?.data) {
    throw new Error(result?.serverError ?? "Failed to upload image.");
  }

  const { path, token, publicUrl } = result.data;
  const { error } = await createClient()
    .storage.from("avatars")
    .uploadToSignedUrl(path, token, file, { cacheControl: "3600" });
  if (error) {
    throw error;
  }

  return publicUrl;
}
