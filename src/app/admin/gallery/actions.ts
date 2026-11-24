"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/admin/gallery";
function rpcError(e: { code?: string; message: string } | null, fallback: string) {
  return e?.code === "P0001" ? e.message : fallback;
}

// Called once per photo by the uploader, after the browser has put the file in Storage.
export async function addGalleryPhoto(path: string, caption: string | null, eventId: string | null): Promise<{ error?: string }> {
  await requireAdmin(PAGE);
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_gallery_photo", { p_path: path, p_caption: caption, p_event_id: eventId });
  if (error) return { error: rpcError(error, "Couldn't add that photo.") };
  revalidatePath("/");
  revalidatePath(PAGE);
  return {};
}

export async function hideGalleryPhoto(formData: FormData) {
  await requireAdmin(PAGE);
  const supabase = await createClient();
  const { error } = await supabase.rpc("hide_gallery_photo", { p_id: String(formData.get("id") ?? "") });
  revalidatePath("/");
  revalidatePath(PAGE);
  redirect(`${PAGE}?${error ? `error=${encodeURIComponent(rpcError(error, "Couldn't remove it."))}` : `ok=${encodeURIComponent("Removed from the gallery.")}`}`);
}

export async function setGalleryPhotoOnHome(formData: FormData) {
  await requireAdmin(PAGE);
  const supabase = await createClient();
  const on = formData.get("on") === "1";
  const { error } = await supabase.rpc("set_gallery_photo_on_home", { p_id: String(formData.get("id") ?? ""), p_on: on });
  revalidatePath("/");
  revalidatePath(PAGE);
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(rpcError(error, "Couldn't change that."))}`);
}

export async function setGalleryPhotoCover(formData: FormData) {
  await requireAdmin(PAGE);
  const supabase = await createClient();
  const on = formData.get("on") === "1";
  const { error } = await supabase.rpc("set_gallery_photo_cover", { p_id: String(formData.get("id") ?? ""), p_on: on });
  revalidatePath("/", "layout"); // home banner, /gallery and the album page
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(rpcError(error, "Couldn't change the cover."))}#covers`);
}

/** "Show until" is a date: the banner runs to the end of that day, Hong Kong time. */
export async function saveHomeBanner(formData: FormData) {
  await requireAdmin(PAGE);
  const supabase = await createClient();
  const until = String(formData.get("until") ?? "");
  const { error } = await supabase.rpc("set_home_banner", {
    p_event_id: String(formData.get("event_id") ?? "") || null,
    p_theme: String(formData.get("theme") ?? ""),
    p_eyebrow: String(formData.get("eyebrow") ?? ""),
    p_headline: String(formData.get("headline") ?? ""),
    p_blurb: String(formData.get("blurb") ?? ""),
    p_cta: String(formData.get("cta") ?? ""),
    p_ends_at: /^\d{4}-\d{2}-\d{2}$/.test(until) ? `${until}T23:59:59+08:00` : null,
  });
  revalidatePath("/");
  revalidatePath(PAGE);
  redirect(`${PAGE}?${error ? `error=${encodeURIComponent(rpcError(error, "Couldn't save the banner."))}` : `ok=${encodeURIComponent("Banner saved. It's on the home page now.")}`}#banner`);
}

export async function clearHomeBanner() {
  await requireAdmin(PAGE);
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_home_banner");
  revalidatePath("/");
  revalidatePath(PAGE);
  redirect(`${PAGE}?${error ? `error=${encodeURIComponent(rpcError(error, "Couldn't turn it off."))}` : `ok=${encodeURIComponent("Banner turned off.")}`}#banner`);
}
