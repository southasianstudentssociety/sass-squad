"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A button that opens a centred pop-up card. Forms inside it submit as usual;
 * when the page comes back with a new ?ok= or ?error= the pop-up closes, so the
 * message shows on the page underneath.
 */
export function Modal({
  label,
  title,
  description,
  triggerClassName,
  icon,
  defaultOpen = false,
  children,
}: {
  label: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  triggerClassName?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const query = useSearchParams().toString();
  const [seenQuery, setSeenQuery] = useState(query);
  if (seenQuery !== query) {
    // Navigated (form saved, or an error came back): close.
    setSeenQuery(query);
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={cn("btn-primary", triggerClassName)}>
        {icon}
        {label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none"
        />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-3 sm:items-center sm:p-6">
          <Dialog.Popup
            className={cn(
              "card relative max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto p-5 shadow-[var(--shadow-float)] outline-none sm:p-6",
              "transition-[transform,opacity] duration-150 ease-[var(--ease-out-soft)] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none",
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
                {description && <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>}
              </div>
              <Dialog.Close className="-m-1 rounded-lg p-1 text-muted outline-none hover:bg-page hover:text-ink" aria-label="Close">
                <X className="size-5" aria-hidden />
              </Dialog.Close>
            </div>
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
