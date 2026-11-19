/**
 * X hands out profile photos as a 48px thumbnail ("…_normal.jpg"), which is
 * what gets saved at sign-in. The same photo at 400px is one suffix away;
 * shown from the thumbnail, a profile's photo is visibly soft. Other hosts'
 * photos are returned as they are.
 */
export function sharpXPhoto(src: string): string {
  if (!src.startsWith("https://pbs.twimg.com/")) return src;
  return src.replace(/_(normal|bigger|mini)(\.[a-z]+)$/i, "_400x400$2");
}
