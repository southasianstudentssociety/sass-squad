"use client";

import { useActionState } from "react";
import { FOOD_PREFERENCES, PHONE_HINT } from "@/lib/profile";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { saveDetails, startEmailChange, verifyEmailChange, type DetailsState, type EmailChangeState } from "./actions";

export function DetailsForm({ fullName, phone, food, phoneRequired }: { fullName: string; phone: string; food: string; phoneRequired: boolean }) {
  const [state, action] = useActionState<DetailsState, FormData>(saveDetails, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="ac-name">Full name</label>
        <input id="ac-name" name="full_name" required autoComplete="name" defaultValue={fullName} className="input" />
        <p className="hint">Shown on your ticket and checked at the door, so use your real name.</p>
      </div>
      <div>
        <label className="label" htmlFor="ac-phone">WhatsApp number{phoneRequired ? "" : " (optional)"}</label>
        <input id="ac-phone" name="phone" type="tel" autoComplete="tel" required={phoneRequired} defaultValue={phone} placeholder="+852 12345678" className="input" />
        <p className="hint">{phoneRequired && "Required for members: it's how we add you to the members' group chat. "}{PHONE_HINT}</p>
      </div>
      <div>
        <label className="label" htmlFor="ac-food">Food preference (optional)</label>
        <select id="ac-food" name="food_preference" defaultValue={food} className="input">
          <option value="">Prefer not to say</option>
          {FOOD_PREFERENCES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <p className="hint">Helps us order the right food for events.</p>
      </div>
      <div className="sm:col-span-2"><FormMessage error={state.error} success={state.ok} /></div>
      <div className="sm:col-span-2"><SubmitButton pendingText="Saving…">Save details</SubmitButton></div>
    </form>
  );
}

export function EmailChangeForm({ current, suggested }: { current: string; suggested?: string }) {
  const [start, startAction] = useActionState<EmailChangeState, FormData>(startEmailChange, { step: "email" });
  const [verify, verifyAction] = useActionState<EmailChangeState, FormData>(verifyEmailChange, { step: "code" });
  if (start.step === "code" && start.email) {
    return (
      <form action={verifyAction} className="space-y-2">
        <input type="hidden" name="email" value={start.email} />
        <FormMessage success={verify.info ?? start.info} error={verify.error} />
        <label className="label text-xs" htmlFor="ec-code">Code from the email to {start.email}</label>
        <div className="flex gap-2">
          <input id="ec-code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="input max-w-44 tracking-[0.3em]" />
          <SubmitButton pendingText="Checking…">Confirm</SubmitButton>
        </div>
      </form>
    );
  }
  return (
    <form action={startAction} className="space-y-2">
      <label className="label text-xs" htmlFor="ec-email">New login email</label>
      <div className="flex flex-wrap gap-2">
        <input id="ec-email" name="email" type="email" required defaultValue={start.email ?? suggested} placeholder={current.endsWith("ust.hk") ? "you@gmail.com" : "you@connect.ust.hk"} className="input min-w-56 flex-1" />
        <SubmitButton className="btn-ghost" pendingText="Sending…">Send code</SubmitButton>
      </div>
      <FormMessage error={start.error} />
    </form>
  );
}
