import { CircleAlert, CircleCheck } from "lucide-react";

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) {
    return (
      <p role="alert" className="flex animate-fade-up items-start gap-2 rounded-xl border border-bad/20 bg-bad/[0.04] px-3.5 py-2.5 text-sm text-bad">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{error}</span>
      </p>
    );
  }
  if (success) {
    return (
      <p role="status" className="flex animate-fade-up items-start gap-2 rounded-xl border border-ok/20 bg-ok/[0.04] px-3.5 py-2.5 text-sm text-ok">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{success}</span>
      </p>
    );
  }
  return null;
}
