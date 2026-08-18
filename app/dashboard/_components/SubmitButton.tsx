"use client";

import { useFormStatus } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import { useGroupBusy } from "./ActionGroup";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "",
  secondary: "secondary",
  ghost: "ghost",
  danger: "danger",
  "danger-outline": "danger outline",
};

export interface SubmitButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  /** Shown instead of children while this button's own form is submitting. Falls back to children if omitted. */
  pendingLabel?: ReactNode;
  disabled?: boolean;
  style?: CSSProperties;
}

/**
 * Every mutating Server Action in the dashboard used a plain
 * `<button type="submit">` with no feedback between click and the page
 * actually changing — Phase 7.1A's audit flagged this as a real
 * double-submit risk, not just a cosmetic gap. This is a drop-in
 * replacement: same label, same position, same underlying `<form
 * action={...}>` — it only adds a disabled+spinner state while its form's
 * Server Action is in flight (via React's own `useFormStatus`, so it always
 * reflects the *real* request, never a guessed timeout) and disables itself
 * when a sibling action in the same ActionGroup is submitting.
 */
export function SubmitButton({ children, variant = "primary", pendingLabel, disabled, style }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const groupBusy = useGroupBusy();
  const isDisabled = Boolean(disabled) || pending || groupBusy;
  return (
    <button type="submit" className={`dash-btn ${VARIANT_CLASS[variant]}`.trim()} disabled={isDisabled} aria-busy={pending} style={style}>
      {pending && <span className="dash-spinner" aria-hidden="true" />}
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </button>
  );
}
