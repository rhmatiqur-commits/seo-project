"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const GroupBusyContext = createContext(false);

/** True when a sibling form inside the nearest ActionGroup is currently
 * submitting — lets SubmitButton disable itself even though its *own* form
 * isn't the one in flight. Outside any ActionGroup this is always false. */
export function useGroupBusy(): boolean {
  return useContext(GroupBusyContext);
}

/**
 * Wraps a set of mutually-relevant action forms (e.g. "Approve" / "Reject"
 * on the same content job) so that submitting one disables the others —
 * the audit's "disable conflicting sibling actions" requirement. Each
 * action keeps its own separate `<form action={...}>`; this only listens
 * for the (bubbling) `submit` event to know a sibling has started.
 */
export function ActionGroup({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <div onSubmit={() => setBusy(true)} style={{ display: "contents" }}>
      <GroupBusyContext.Provider value={busy}>{children}</GroupBusyContext.Provider>
    </div>
  );
}
