/**
 * The address of a picture in our own storage under `folder`, or null.
 *
 * Pictures are uploaded from the browser and their address is then sent to
 * the server to save, so the server checks it is one of ours, in the folder
 * that belongs to whoever is saving it, before it goes on a profile.
 */
export function ownUploadUrl(url: string, folder: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  try {
    // Parsing resolves any `..` before the folder is checked.
    const parsed = new URL(url);
    if (parsed.origin !== new URL(base).origin) return null;
    const prefix = `/storage/v1/object/public/avatars/${folder}/`;
    return parsed.pathname.startsWith(prefix) ? parsed.href : null;
  } catch {
    return null;
  }
}
