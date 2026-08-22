import { describe, expect, it } from "vitest";

import { homeFor, resolveProtectedRoute, type AuthState } from "./route-guard";

const loggedOut: AuthState = { kind: "logged-out" };
const noAccount: AuthState = { kind: "no-account" };
const freelancer: AuthState = { kind: "account", role: "FREELANCER", hasProfile: true };
const freelancerNew: AuthState = { kind: "account", role: "FREELANCER", hasProfile: false };
const recruiter: AuthState = { kind: "account", role: "RECRUITER", hasProfile: true };
const recruiterNew: AuthState = { kind: "account", role: "RECRUITER", hasProfile: false };
const admin: AuthState = { kind: "account", role: "ADMIN", hasProfile: true };

const expectRedirect = (path: string, state: AuthState, target: string) => {
  expect(resolveProtectedRoute(path, state)).toEqual({ allow: false, redirectTo: target });
};
const expectAllow = (path: string, state: AuthState) => {
  expect(resolveProtectedRoute(path, state)).toEqual({ allow: true });
};

describe("homeFor", () => {
  it("routes each role to its place, onboarding first", () => {
    expect(homeFor("FREELANCER", false)).toBe("/onboarding/freelancer");
    expect(homeFor("FREELANCER", true)).toBe("/dashboard/freelancer");
    expect(homeFor("RECRUITER", false)).toBe("/onboarding/recruiter");
    expect(homeFor("RECRUITER", true)).toBe("/dashboard/recruiter");
    expect(homeFor("ADMIN", false)).toBe("/admin");
    expect(homeFor("ADMIN", true)).toBe("/admin");
  });
});

describe("resolveProtectedRoute — public paths", () => {
  it("never touches paths outside the protected areas", () => {
    expectAllow("/", loggedOut);
    expectAllow("/jobs/some-job", loggedOut);
    expectAllow("/freelancers/someone", noAccount);
    expectAllow("/signin", loggedOut);
  });
});

describe("resolveProtectedRoute — logged out", () => {
  it("sends every protected path to signin, preserving the destination", () => {
    expectRedirect("/dashboard", loggedOut, "/signin?next=%2Fdashboard");
    expectRedirect(
      "/dashboard/freelancer",
      loggedOut,
      "/signin?next=%2Fdashboard%2Ffreelancer",
    );
    expectRedirect("/dashboard/recruiter", loggedOut, "/signin?next=%2Fdashboard%2Frecruiter");
    expectRedirect("/admin", loggedOut, "/signin?next=%2Fadmin");
    expectRedirect("/onboarding", loggedOut, "/signin?next=%2Fonboarding");
  });
});

describe("resolveProtectedRoute — session without an account (OAuth-first)", () => {
  it("allows only the role chooser", () => {
    expectAllow("/onboarding", noAccount);
  });
  it("funnels everything else to the role chooser", () => {
    expectRedirect("/onboarding/freelancer", noAccount, "/onboarding");
    expectRedirect("/onboarding/recruiter", noAccount, "/onboarding");
    expectRedirect("/dashboard", noAccount, "/onboarding");
    expectRedirect("/dashboard/freelancer", noAccount, "/onboarding");
    expectRedirect("/admin", noAccount, "/onboarding");
  });
});

describe("resolveProtectedRoute — freelancer", () => {
  it("with a profile: own dashboard allowed, everything else bounces home", () => {
    expectAllow("/dashboard/freelancer", freelancer);
    expectAllow("/dashboard/freelancer/applications", freelancer);
    expectRedirect("/dashboard/recruiter", freelancer, "/dashboard/freelancer");
    expectRedirect("/dashboard", freelancer, "/dashboard/freelancer");
    expectRedirect("/admin", freelancer, "/dashboard/freelancer");
    expectRedirect("/onboarding", freelancer, "/dashboard/freelancer");
    expectRedirect("/onboarding/freelancer", freelancer, "/dashboard/freelancer");
    expectRedirect("/onboarding/recruiter", freelancer, "/dashboard/freelancer");
  });

  it("without a profile: only own onboarding allowed", () => {
    expectAllow("/onboarding/freelancer", freelancerNew);
    expectRedirect("/dashboard/freelancer", freelancerNew, "/onboarding/freelancer");
    expectRedirect("/dashboard/recruiter", freelancerNew, "/onboarding/freelancer");
    expectRedirect("/dashboard", freelancerNew, "/onboarding/freelancer");
    expectRedirect("/admin", freelancerNew, "/onboarding/freelancer");
    expectRedirect("/onboarding", freelancerNew, "/onboarding/freelancer");
    expectRedirect("/onboarding/recruiter", freelancerNew, "/onboarding/freelancer");
  });
});

describe("resolveProtectedRoute — recruiter", () => {
  it("with a profile: own dashboard allowed, everything else bounces home", () => {
    expectAllow("/dashboard/recruiter", recruiter);
    expectAllow("/dashboard/recruiter/jobs", recruiter);
    expectRedirect("/dashboard/freelancer", recruiter, "/dashboard/recruiter");
    expectRedirect("/admin", recruiter, "/dashboard/recruiter");
    expectRedirect("/onboarding", recruiter, "/dashboard/recruiter");
  });

  it("without a profile: only own onboarding allowed", () => {
    expectAllow("/onboarding/recruiter", recruiterNew);
    expectRedirect("/dashboard/recruiter", recruiterNew, "/onboarding/recruiter");
    expectRedirect("/admin", recruiterNew, "/onboarding/recruiter");
  });
});

describe("resolveProtectedRoute — admin", () => {
  it("allows the admin area and nothing user-facing", () => {
    expectAllow("/admin", admin);
    expectAllow("/admin/flags", admin);
    expectRedirect("/dashboard", admin, "/admin");
    expectRedirect("/dashboard/freelancer", admin, "/admin");
    expectRedirect("/dashboard/recruiter", admin, "/admin");
    expectRedirect("/onboarding", admin, "/admin");
  });
});

/**
 * Messages are the one product area both roles share, so it sits outside the
 * /dashboard/freelancer and /dashboard/recruiter prefixes — which meant the
 * fallthrough treated it as an unknown subpath and bounced everyone home.
 */
describe("shared product areas", () => {
  const freelancer: AuthState = { kind: "account", role: "FREELANCER", hasProfile: true };
  const recruiter: AuthState = { kind: "account", role: "RECRUITER", hasProfile: true };

  it("lets either role reach messages", () => {
    for (const state of [freelancer, recruiter]) {
      expect(resolveProtectedRoute("/dashboard/messages", state)).toEqual({ allow: true });
      expect(resolveProtectedRoute("/dashboard/messages/abc123", state)).toEqual({ allow: true });
    }
  });

  it("sends an unfinished profile to onboarding first", () => {
    expect(
      resolveProtectedRoute("/dashboard/messages", {
        kind: "account",
        role: "FREELANCER",
        hasProfile: false,
      }),
    ).toEqual({ allow: false, redirectTo: "/onboarding/freelancer" });
  });

  it("gives an admin no inbox — they have no side in anyone's conversation", () => {
    expect(
      resolveProtectedRoute("/dashboard/messages", {
        kind: "account",
        role: "ADMIN",
        hasProfile: true,
      }),
    ).toEqual({ allow: false, redirectTo: "/admin" });
  });

  it("still sends a logged-out visitor to sign in, keeping the destination", () => {
    expect(resolveProtectedRoute("/dashboard/messages", { kind: "logged-out" })).toEqual({
      allow: false,
      redirectTo: "/signin?next=%2Fdashboard%2Fmessages",
    });
  });

  // Settings is the second shared area: one screen for both roles, so it sits
  // outside both role prefixes and needs the same treatment as messages.
  it("lets either role reach settings", () => {
    for (const state of [freelancer, recruiter]) {
      expect(resolveProtectedRoute("/dashboard/settings", state)).toEqual({ allow: true });
    }
  });

  it("sends an unfinished profile to onboarding before settings", () => {
    expect(
      resolveProtectedRoute("/dashboard/settings", {
        kind: "account",
        role: "RECRUITER",
        hasProfile: false,
      }),
    ).toEqual({ allow: false, redirectTo: "/onboarding/recruiter" });
  });

  it("gives an admin no settings screen — they have no profile to configure", () => {
    expect(
      resolveProtectedRoute("/dashboard/settings", {
        kind: "account",
        role: "ADMIN",
        hasProfile: true,
      }),
    ).toEqual({ allow: false, redirectTo: "/admin" });
  });

  it("sends a logged-out visitor to sign in, keeping settings as the destination", () => {
    expect(resolveProtectedRoute("/dashboard/settings", { kind: "logged-out" })).toEqual({
      allow: false,
      redirectTo: "/signin?next=%2Fdashboard%2Fsettings",
    });
  });

  it("funnels an account-less OAuth session to the role chooser, not settings", () => {
    expect(resolveProtectedRoute("/dashboard/settings", { kind: "no-account" })).toEqual({
      allow: false,
      redirectTo: "/onboarding",
    });
  });
});
