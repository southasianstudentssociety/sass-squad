import { EventForm } from "../event-form";
import { FormMessage } from "@/components/form-message";

export const metadata = { title: "New event" };

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-display font-normal">New event</h1>
      <FormMessage error={sp.error} />
      <EventForm />
    </div>
  );
}
