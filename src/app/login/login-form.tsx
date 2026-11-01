"use client";

import { useActionState, useState } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
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
      <form action={(fd) => { setEditing(false); return sendAction(fd); }} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email" name="email" type="email" required autoComplete="email" inputMode="email"
            defaultValue={email} placeholder="your uni email or Gmail" className="input"
          />
          <p className="hint">Use the email your membership is under, so we can recognise you as a member.</p>
        </div>
        <FormMessage error={sendState.error} />
        <SubmitButton className="btn-primary w-full" pendingText="Sending…">Email me a login code</SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <FormMessage success={sendState.info} />
      <form action={verifyAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />
        <div>
          <label className="label" htmlFor="code">Login code</label>
          <input
            id="code" name="code" required autoFocus autoComplete="one-time-code" inputMode="numeric"
            pattern="[0-9 ]{6,12}" placeholder="12345678" className="input text-center text-2xl tracking-[0.3em]"
          />
          <p className="hint">Or tap the link in the email on this device. Check spam if it hasn&apos;t arrived.</p>
        </div>
        <FormMessage error={verifyState.error} />
        <SubmitButton className="btn-primary w-full" pendingText="Checking…">Log in</SubmitButton>
      </form>
      <button type="button" onClick={() => setEditing(true)} className="text-sm text-muted underline">
        Use a different email / resend
      </button>
    </div>
  );
}
