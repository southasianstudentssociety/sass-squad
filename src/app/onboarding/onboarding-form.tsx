"use client";

import { useActionState } from "react";
import { saveProfile, type OnboardingState } from "./actions";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

export function OnboardingForm(props: { next: string; email: string; fullName: string; phone: string; editing: boolean; phoneRequired?: boolean }) {
  const [state, action] = useActionState<OnboardingState, FormData>(saveProfile, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={props.next} />
      <div>
        <label className="label">Email</label>
        <input className="input" value={props.email} disabled />
        <p className="hint">This is the email you log in with. You can link your Gmail or UST email later in Settings.</p>
      </div>
      <div>
        <label className="label" htmlFor="full_name">Full name</label>
        <input id="full_name" name="full_name" required autoComplete="name" defaultValue={props.fullName} className="input" />
        <p className="hint">Shown on your ticket and checked at the door, so use your real name.</p>
      </div>
      <div>
        <label className="label" htmlFor="phone">WhatsApp number{props.phoneRequired ? "" : " (optional)"}</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" required={props.phoneRequired} defaultValue={props.phone} placeholder="+852 12345678" className="input" />
        <p className="hint">{props.phoneRequired ? "Members: we use this to add you to the members' WhatsApp group. " : ""}Include the country code, e.g. +852 12345678.</p>
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="btn-primary w-full" pendingText="Saving…">
        {props.editing ? "Save" : "Continue"}
      </SubmitButton>
    </form>
  );
}
