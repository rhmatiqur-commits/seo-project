"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server-session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getInvitationByToken, markInvitationAccepted } from "@/lib/db/invitations";
import { insertMembership } from "@/lib/db/memberships";
import { getOrganization } from "@/lib/db/organizations";

/**
 * Every auth action here uses the request-scoped session client
 * (lib/supabase/server-session.ts) for the actual sign-in/sign-out/password
 * calls — that's the client whose cookie writes persist to the browser.
 * `supabaseAdmin()` (service-role) is only used for the two operations that
 * legitimately need elevated privilege: creating a brand-new Auth user
 * during invite acceptance, and reading `organization_invitations` (which
 * an unauthenticated visitor must be able to look up by token before they
 * have any session at all).
 */

function errorRedirect(basePath: string, message: string, extra: Record<string, string> = {}): never {
  const params = new URLSearchParams({ error: message, ...extra });
  redirect(`${basePath}?${params.toString()}`);
}

export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) errorRedirect("/dashboard/login", "Email and password are required.", { next });

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) errorRedirect("/dashboard/login", "Incorrect email or password.", { next });

  redirect(next.startsWith("/dashboard") ? next : "/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/dashboard/login");
}

/** Always shows the same "check your email" outcome whether or not the
 * account exists — never confirms/denies an email is registered (user
 * enumeration). */
export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (email) {
    const supabase = await createSessionClient();
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "";
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: origin ? `${origin}/dashboard/reset-password` : undefined,
    });
  }
  redirect("/dashboard/forgot-password?sent=1");
}

/** Called from the reset-password page once the recovery link's `code` has
 * already been exchanged for a (recovery-scoped) session server-side — see
 * app/dashboard/reset-password/page.tsx. `updateUser` here operates on
 * *that* session, never on a password/organisation supplied directly by
 * the form beyond the new password itself. */
export async function updatePasswordAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) errorRedirect("/dashboard/reset-password", "Password must be at least 8 characters.");

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) errorRedirect("/dashboard/reset-password", error.message);

  redirect("/dashboard");
}

/** Invite acceptance, path A: no Supabase Auth account exists yet for the
 * invited email — create one (service-role, since this is the one place a
 * new account is legitimately created without a normal signup flow: the
 * invitation link itself is the proof of email ownership) and sign them in. */
export async function acceptInvitationSignupAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) errorRedirect(`/dashboard/accept-invite`, "Password must be at least 8 characters.", { token });

  const invitation = await getInvitationByToken(token);
  if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at) < new Date()) {
    errorRedirect("/dashboard/accept-invite", "This invitation is invalid or has expired.", { token });
  }

  const admin = supabaseAdmin();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invitation!.email,
    password,
    email_confirm: true, // the invitation link is itself proof of email ownership
  });
  if (createError || !created.user) {
    errorRedirect("/dashboard/accept-invite", createError?.message ?? "Could not create your account.", { token });
  }

  // organization_id/role come from the invitation row only — never from formData.
  await insertMembership({ organizationId: invitation!.organization_id, userId: created!.user!.id, role: invitation!.role });
  await markInvitationAccepted(invitation!.id);

  const session = await createSessionClient();
  const { error: signInError } = await session.auth.signInWithPassword({ email: invitation!.email, password });
  if (signInError) redirect("/dashboard/login");

  const organization = await getOrganization(invitation!.organization_id);
  redirect(`/dashboard/${organization?.slug ?? ""}`);
}

/** Invite acceptance, path B: an account already exists (the visitor is
 * either already signed in, or needs to sign in first) — creates the
 * membership only after confirming the *signed-in* user's own email
 * (server-verified via getCurrentUser, never form input) matches the
 * invitation's email exactly. */
export async function acceptInvitationForExistingUserAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const invitation = await getInvitationByToken(token);
  if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at) < new Date()) {
    errorRedirect("/dashboard/accept-invite", "This invitation is invalid or has expired.", { token });
  }

  const user = await getCurrentUser();
  if (!user) redirect(`/dashboard/login?next=${encodeURIComponent(`/dashboard/accept-invite?token=${token}`)}`);

  if ((user!.email ?? "").toLowerCase() !== invitation!.email.toLowerCase()) {
    errorRedirect("/dashboard/accept-invite", `This invitation was sent to ${invitation!.email}, but you're signed in as ${user!.email}. Sign out and try again.`, { token });
  }

  await insertMembership({ organizationId: invitation!.organization_id, userId: user!.id, role: invitation!.role });
  await markInvitationAccepted(invitation!.id);

  const organization = await getOrganization(invitation!.organization_id);
  redirect(`/dashboard/${organization?.slug ?? ""}`);
}
