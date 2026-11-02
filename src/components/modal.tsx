"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const ModalContext = createContext<{ close: () => void }>({ close: () => {} });

/** Close the surrounding Modal (e.g. after a client-side save succeeds). */
export function useModal() {
  return useContext(ModalContext);
}

/**
 * A button that opens a centred pop-up card. Put <ModalFormDone /> inside a
 * server-action form so the pop-up closes when the save finishes, or stays
 * open and shows the error if it came back with ?error=.
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

  return (
    <ModalContext.Provider value={{ close: () => setOpen(false) }}>
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
    </ModalContext.Provider>
  );
}

/**
 * Goes inside a server-action <form> in a Modal. When a submission finishes:
 * no ?error= in the URL -> close the pop-up; an error -> stay open and show it here.
 */
export function ModalFormDone({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  const { close } = useModal();
  const error = useSearchParams().get("error");
  const [wasPending, setWasPending] = useState(pending);
  const [finished, setFinished] = useState(0);
  if (wasPending !== pending) {
    setWasPending(pending);
    if (!pending) setFinished((n) => n + 1);
  }
  useEffect(() => {
    if (finished > 0 && !error) close();
  }, [finished, error, close]);

  if (finished === 0 || !error) return null;
  return <p role="alert" className={cn("rounded-xl border border-bad/20 bg-bad/5 px-3 py-2 text-sm text-bad", className)}>{error}</p>;
}
