"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { MessageCircle } from "lucide-react";
import { savePhone, type DetailsState } from "@/app/account/actions";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

const DISMISS_KEY = "sass-phone-prompt-later";

/**
 * Members without a WhatsApp number get this once per visit (browser session):
 * a pop-up asking for it, so they can be added to the members' group chat.
 * "Later" hides it until the next visit. Not shown on Settings itself.
 */
export function PhonePrompt() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<DetailsState, FormData>(savePhone, {});

  useEffect(() => {
    if (pathname.startsWith("/account") || pathname.startsWith("/onboarding") || pathname.startsWith("/login")) return;
    let later = false;
    try { later = sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { /* storage blocked: just ask */ }
    if (later) return;
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, [pathname]);

  const later = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : later())}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
          <Dialog.Popup className="card w-full max-w-md space-y-4 p-6 shadow-[var(--shadow-float)] outline-none transition-[transform,opacity] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ok/10 text-ok"><MessageCircle className="size-5" aria-hidden /></span>
              <div>
                <Dialog.Title className="text-lg font-bold">Add your WhatsApp number</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted">
                  Please add your phone number so we can add you to the members&apos; group chat. Use your WhatsApp number with the country code.
                </Dialog.Description>
              </div>
            </div>
            {state.ok ? (
              <div className="space-y-3">
                <FormMessage success={state.ok} />
                <button type="button" className="btn-primary w-full" onClick={() => setOpen(false)}>Done</button>
              </div>
            ) : (
              <form action={action} className="space-y-3">
                <div>
                  <label className="label" htmlFor="pp-phone">WhatsApp number</label>
                  <input id="pp-phone" name="phone" type="tel" autoComplete="tel" required placeholder="+852 12345678" className="input" />
                  <p className="hint">e.g. +852 12345678</p>
                </div>
                <FormMessage error={state.error} />
                <div className="flex gap-2">
                  <SubmitButton className="btn-primary flex-1" pendingText="Saving…">Save</SubmitButton>
                  <button type="button" className="btn-ghost" onClick={later}>Later</button>
                </div>
              </form>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
