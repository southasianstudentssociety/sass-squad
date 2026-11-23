import { SITE } from "@/lib/site";

/**
 * Hand-set details for gallery albums. An album page exists for any event
 * that has photos (Admin -> Gallery, with the event picked); these only add
 * a Google Drive link and the home page banner.
 */

/** Each event's own Google Drive folder. Events not listed fall back to the shared folder. */
const DRIVE_FOLDERS: Record<string, string> = {
  "diwali-2026": "https://drive.google.com/drive/folders/1X62OBkn2z5t6vV_hUSPS1Fab8HZjlLF4",
};

export function driveUrlFor(eventSlug: string): string {
  return DRIVE_FOLDERS[eventSlug] ?? SITE.photosUrl;
}

/**
 * The "photos are out" banner at the top of the home page. It shows only
 * while the album has photos and until `until`, then disappears by itself.
 * Set to null to switch it off.
 */
export const PHOTO_BANNER: { eventSlug: string; headline: string; cta: string; until: string } | null = {
  eventSlug: "diwali-2026",
  headline: "Diwali 2026 photos are out",
  cta: "Relive the night",
  until: "2026-12-07T23:59:59+08:00",
};

/** The banner config while it's still running, otherwise null. */
export function activePhotoBanner() {
  return PHOTO_BANNER && Date.now() < Date.parse(PHOTO_BANNER.until) ? PHOTO_BANNER : null;
}
