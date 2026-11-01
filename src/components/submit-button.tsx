"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

export function SubmitButton({
  children,
  pendingText,
  className = "btn-primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} className={className} disabled={pending || rest.disabled} aria-busy={pending || undefined}>
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
