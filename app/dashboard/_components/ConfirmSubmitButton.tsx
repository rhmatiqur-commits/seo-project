"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ConfirmVariant = "primary" | "danger" | "danger-outline";

function variantClass(variant: ConfirmVariant): string {
  if (variant === "danger") return "danger";
  if (variant === "danger-outline") return "danger outline";
  return "";
}

function ConfirmSubmit({ variant, children }: { variant: ConfirmVariant; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`dash-btn ${variantClass(variant)}`.trim()} disabled={pending} aria-busy={pending}>
      {pending && <span className="dash-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export interface ConfirmSubmitButtonProps {
  /** Trigger button label. */
  children: ReactNode;
  variant?: ConfirmVariant;
  disabled?: boolean;
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel?: string;
  cancelLabel?: string;
  style?: CSSProperties;
}

/**
 * For the three highest-stakes actions in the portal — rejecting content,
 * removing a team member, and merging/publishing to production — a single
 * accidental click currently does the irreversible thing immediately. This
 * inserts one extra, deliberate step: the trigger button opens a small
 * modal describing exactly what's about to happen; only the dialog's own
 * "Confirm" button (a real `type="submit"`, a descendant of the same
 * `<form action={...}>` the page already renders) actually submits. No
 * Server Action logic changes — this is purely a client-side UX gate in
 * front of the exact same form.
 */
export function ConfirmSubmitButton({
  children,
  variant = "primary",
  disabled,
  confirmTitle,
  confirmDescription,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  style,
}: ConfirmSubmitButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button type="button" className={`dash-btn ${variantClass(variant)}`.trim()} disabled={disabled} onClick={() => setOpen(true)} style={style}>
        {children}
      </button>
      <dialog
        ref={dialogRef}
        className="dash-dialog"
        aria-labelledby="dash-confirm-title"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="dash-dialog-body">
          <h3 id="dash-confirm-title">{confirmTitle}</h3>
          <p>{confirmDescription}</p>
        </div>
        <div className="dash-dialog-actions">
          <button type="button" className="dash-btn secondary" onClick={() => setOpen(false)}>
            {cancelLabel}
          </button>
          <ConfirmSubmit variant={variant}>{confirmLabel}</ConfirmSubmit>
        </div>
      </dialog>
    </>
  );
}
