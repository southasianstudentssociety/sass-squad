"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { addGalleryPhoto } from "./actions";

const MAX_EDGE = 1600;

/** Shrink a photo in the browser: longest side 1600 px, WebP (or JPEG where WebP can't be made). */
async function shrink(file: File): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  const webp = await encode("image/webp", 0.8);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpeg = await encode("image/jpeg", 0.82);
  if (!jpeg) throw new Error("encode");
  return { blob: jpeg, ext: "jpg" };
}

export function GalleryUploader({ userId, events }: { userId: string; events: { id: string; title: string; date: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const files = (fd.getAll("photos") as File[]).filter((f) => f.size > 0);
    const caption = String(fd.get("caption") ?? "").trim() || null;
    const eventId = String(fd.get("event_id") ?? "") || null;
    if (files.length === 0) return setProblems(["Choose at least one photo."]);
    setProblems([]);
    start(async () => {
      const supabase = createClient();
      const failed: string[] = [];
      let done = 0;
      for (const file of files) {
        setProgress(`Uploading ${done + 1} of ${files.length}…`);
        try {
          const { blob, ext } = await shrink(file);
          const path = `${userId}/${crypto.randomUUID()}.${ext}`;
          const { error: up } = await supabase.storage.from("gallery").upload(path, blob, { contentType: blob.type, upsert: false });
          if (up) throw new Error("upload");
          const res = await addGalleryPhoto(path, caption, eventId);
          if (res.error) failed.push(`${file.name}: ${res.error}`);
          else done++;
        } catch {
          failed.push(`${file.name}: couldn't read or upload it. Use a JPEG or PNG (iPhone HEIC photos only work from Safari).`);
        }
      }
      setProgress(`${done} of ${files.length} added.`);
      setProblems(failed);
      if (done > 0) {
        form.reset();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="card grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="g-files">Photos</label>
        <input id="g-files" name="photos" type="file" accept="image/*" multiple required className="input" />
        <p className="hint">Pick several at once. Each one is shrunk on your device before uploading (about 1600 px wide), so full-size camera photos are fine.</p>
      </div>
      <div>
        <label className="label" htmlFor="g-event">Event (optional)</label>
        <select id="g-event" name="event_id" defaultValue="" className="input">
          <option value="">None</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} · {ev.date}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="g-caption">Caption (optional, for all of these)</label>
        <input id="g-caption" name="caption" maxLength={120} placeholder="e.g. Diwali 2025" className="input" />
      </div>
      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-bad/20 bg-bad/5 px-3 py-2 text-sm text-bad sm:col-span-2">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Uploading…" : "Add to gallery"}</button>
        {progress && <p className="text-sm text-muted" aria-live="polite">{progress}</p>}
      </div>
    </form>
  );
}
