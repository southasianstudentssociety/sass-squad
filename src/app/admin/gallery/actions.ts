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
