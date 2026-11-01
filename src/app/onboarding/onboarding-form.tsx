"use client";

import { useActionState } from "react";
import { saveProfile, type OnboardingState } from "./actions";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

export function OnboardingForm(props: { next: string; email: string; fullName: string; phone: string; editing: boolean }) {
  const [state, action] = useActionState<OnboardingState, FormData>(saveProfile, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={props.next} />
      <div>
        <label className="label">Email</label>
        <input className="input bg-page text-muted" value={props.email} disabled />
        <p className="hint">This is the email you log in with. To use a different one, log out and log in with it.</p>
      </div>
      <div>
        <label className="label" htmlFor="full_name">Full name</label>
        <input id="full_name" name="full_name" required autoComplete="name" defaultValue={props.fullName} className="input" />
        <p className="hint">Shown on your ticket and checked at the door, so use your real name.</p>
      </div>
      <div>
        <label className="label" htmlFor="phone">Phone (optional)</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={props.phone} className="input" />
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="btn-primary w-full" pendingText="Saving…">
        {props.editing ? "Save" : "Continue"}
      </SubmitButton>
    </form>
  );
}
