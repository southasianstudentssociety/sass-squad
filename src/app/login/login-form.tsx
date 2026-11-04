"use client";

import { useActionState, useState } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { GoogleButton } from "./google-button";

export function LoginForm({ next, initialError, codeArt }: { next: string; initialError?: string; codeArt?: React.ReactNode }) {
  const [sendState, sendAction] = useActionState<LoginState, FormData>(sendCode, {
    step: "email",
    error: initialError,
  });
  const [verifyState, verifyAction] = useActionState<LoginState, FormData>(verifyCode, { step: "code" });
  const [editing, setEditing] = useState(false);

  const onCodeStep = sendState.step === "code" && !editing;
  const email = sendState.email ?? "";

  if (!onCodeStep) {
    return (
      <div className="space-y-3">
      {/* Linked Gmail: no code was sent; Google is the way in. */}
      {sendState.useGoogle && <GoogleButton next={next} />}
      <form action={(fd) => { setEditing(false); return sendAction(fd); }} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email" name="email" type="email" required autoComplete="email" inputMode="email"
            defaultValue={email} placeholder="your uni email or Gmail" className="input"
          />
        </div>
        <FormMessage error={sendState.error} />
        <SubmitButton className={sendState.useGoogle ? "btn-ghost w-full" : "btn-primary w-full"} pendingText="Sending…">
          {sendState.useGoogle ? "Send a code to a different email" : "Email me a login code"}
        </SubmitButton>
      </form>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-5">
      <div className="text-center">
        {codeArt}
        <p className="mt-4 text-sm text-ink">{sendState.info}</p>
      </div>
      <form action={verifyAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />
        <div>
          <label className="label" htmlFor="code">Login code</label>
          <input
            id="code" name="code" required autoFocus autoComplete="one-time-code" inputMode="numeric"
            pattern="[0-9 ]{6,12}" placeholder="12345678" className="input py-3.5 text-center font-mono text-2xl tracking-[0.35em] tabular-nums"
          />
          <p className="hint">It can take a minute. If it hasn&apos;t arrived, check Junk or Spam.</p>
        </div>
        <FormMessage error={verifyState.error} />
        <SubmitButton className="btn-primary w-full" pendingText="Checking…">Log in</SubmitButton>
      </form>
      <button type="button" onClick={() => setEditing(true)} className="mx-auto block text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline">
        Use a different email / resend
      </button>
    </div>
  );
}
