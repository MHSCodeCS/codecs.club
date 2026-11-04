/**
 * Lesson cover images in Convex file storage. Shared by the upload check on
 * the server (which reads the stored file's type and size) and the picker,
 * which refuses a bad file before uploading it.
 */
export const COVER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_COVER_BYTES = 5_000_000;

/** `accept` value for the cover picker. */
export const COVER_ACCEPT = COVER_TYPES.join(",");

/** Why this file can't be a cover, or null. */
export function coverProblem(contentType: string | undefined, size: number): string | null {
  if (!contentType || !(COVER_TYPES as readonly string[]).includes(contentType)) {
    return "Use a PNG, JPEG, WebP or GIF image.";
  }
  if (size === 0) return "That image is empty.";
  if (size > MAX_COVER_BYTES) {
    return `Use an image under ${MAX_COVER_BYTES / 1_000_000} MB.`;
  }
  return null;
}
