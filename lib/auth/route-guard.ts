import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Pure routing decisions for the protected areas of the app.
 *
 * This module has no I/O so the whole redirect matrix is unit-testable.
 * proxy.ts feeds it the auth state it looked up; the same rules are
 * re-enforced per page by lib/auth/guards.ts, so nothing here is
 * load-bearing for security — a request that skips the proxy entirely
 * (curl straight at a route) hits the identical checks server-side.
 */

export type AuthState =
  | { kind: "logged-out" }
  // Supabase session exists but no app User row yet (OAuth-first login
  // that has not chosen a role).
  | { kind: "no-account" }
  | { kind: "account"; role: UserRole; hasProfile: boolean };

export type RouteDecision = { allow: true } | { allow: false; redirectTo: string };

const allow: RouteDecision = { allow: true };
const to = (redirectTo: string): RouteDecision => ({ allow: false, redirectTo });

/** Where a signed-in account belongs right now. */
export const homeFor = (role: UserRole, hasProfile: boolean): string => {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "FREELANCER":
      return hasProfile ? "/dashboard/freelancer" : "/onboarding/freelancer";
    case "RECRUITER":
      return hasProfile ? "/dashboard/recruiter" : "/onboarding/recruiter";
  }
};

export function resolveProtectedRoute(pathname: string, state: AuthState): RouteDecision {
  const inDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const inAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const inOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  if (!inDashboard && !inAdmin && !inOnboarding) return allow;

  if (state.kind === "logged-out") {
    return to(`/signin?next=${encodeURIComponent(pathname)}`);
  }

  if (state.kind === "no-account") {
    // The only place for an account-less session is the role chooser.
    return pathname === "/onboarding" ? allow : to("/onboarding");
  }

  const { role, hasProfile } = state;
  const home = homeFor(role, hasProfile);

  if (inAdmin) {
    return role === "ADMIN" ? allow : to(home);
  }

  if (inOnboarding) {
    // Role is already chosen; the bare chooser is behind them.
    if (pathname === "/onboarding") return to(home);
    if (pathname.startsWith("/onboarding/freelancer")) {
      return role === "FREELANCER" && !hasProfile ? allow : to(home);
    }
    if (pathname.startsWith("/onboarding/recruiter")) {
      return role === "RECRUITER" && !hasProfile ? allow : to(home);
    }
    return to(home);
  }

  // Dashboard.
  if (pathname.startsWith("/dashboard/freelancer")) {
    return role === "FREELANCER" && hasProfile ? allow : to(home);
  }
  if (pathname.startsWith("/dashboard/recruiter")) {
    return role === "RECRUITER" && hasProfile ? allow : to(home);
  }
  // Bare /dashboard or an unknown dashboard subpath: send them home.
  return to(home);
}
