import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS } from "@/lib/events";
import type { SassEvent } from "@/lib/types";
import { EventForm } from "../../event-form";
import { FormMessage } from "@/components/form-message";
import { MEAL_COLUMNS, type MealOption } from "@/lib/meals";

export const metadata = { title: "Edit event" };

export default async function EditEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [{ data: event }, { data: team }, { data: meals }] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle<SassEvent>(),
    supabase.from("event_team_prices").select("price_cents").eq("event_id", id).maybeSingle<{ price_cents: number }>(),
    supabase.from("event_meal_options").select(MEAL_COLUMNS).eq("event_id", id).is("archived_at", null).order("sort_order").returns<MealOption[]>(),
  ]);
  if (!event) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/admin/events/${id}`} className="text-sm text-muted underline">← Back to event</Link>
      <h1 className="text-2xl font-display font-normal">Edit: {event.title}</h1>
      <FormMessage error={sp.error} />
      <EventForm event={event} teamPriceCents={team?.price_cents ?? null} mealOptions={meals ?? []} />
    </div>
  );
}
