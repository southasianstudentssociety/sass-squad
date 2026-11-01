import { CalendarPlus } from "lucide-react";
import { googleCalendarUrl } from "@/lib/calendar-file";

type E = { title: string; slug: string; starts_at: string; ends_at: string | null; venue: string | null; description: string | null };

/** Two plain links: a .ics file (Apple Calendar, Outlook, most phones) and Google Calendar. */
export function AddToCalendar({ event, className = "" }: { event: E; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <CalendarPlus className="size-4 text-muted" aria-hidden />
      <span className="text-sm text-muted">Add to calendar:</span>
      <a href={`/events/${event.slug}/calendar.ics`} className="btn-ghost px-3 py-1.5 text-xs">Apple / Outlook</a>
      <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">Google</a>
    </div>
  );
}
