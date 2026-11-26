/**
 * Hand-set details for gallery albums. An album page exists for any event
 * that has photos (Admin -> Gallery, with the event picked); this only adds
 * a Google Drive link. The home page banner is set in Admin -> Gallery.
 */

/** Each event's own Google Drive folder. Events not listed get no Drive link. */
const DRIVE_FOLDERS: Record<string, string> = {
  "diwali-2026": "https://drive.google.com/drive/folders/1X62OBkn2z5t6vV_hUSPS1Fab8HZjlLF4",
  "diwali-2025": "https://drive.google.com/drive/folders/1PWjAm1IU9Aw27V0O7yCZM0vxTOLL_dYG",
  "welcome-back-mixer-2026": "https://drive.google.com/drive/folders/1IdW7Yv0TIQNEcwDdvO0XTYEUe5ifrYxx",
};

export function driveUrlFor(eventSlug: string): string | null {
  return DRIVE_FOLDERS[eventSlug] ?? null;
}
