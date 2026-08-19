import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserAuthState } from "@/lib/db/users";

const { RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(public readonly to: string) {
      super(`redirect:${to}`);
    }
  }
  return { RedirectError };
});

vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new RedirectError(to);
  },
}));

vi.mock("./session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db/users", () => ({
  getUserAuthState: vi.fn(),
  getFreelancerProfileByUserId: vi.fn(),
  getRecruiterProfileByUserId: vi.fn(),
}));

import {
  getFreelancerProfileByUserId,
  getRecruiterProfileByUserId,
  getUserAuthState,
} from "@/lib/db/users";

import { getCurrentProfile, requireRole, requireUser } from "./guards";
import { getSession } from "./session";

const mockGetSession = vi.mocked(getSession);
const mockGetUserAuthState = vi.mocked(getUserAuthState);
const mockFreelancerProfile = vi.mocked(getFreelancerProfileByUserId);
const mockRecruiterProfile = vi.mocked(getRecruiterProfileByUserId);

const SESSION = { userId: "00000000-0000-4000-8000-000000000001", email: "a@b.test" };

const state = (role: UserAuthState["role"], hasProfile: boolean): UserAuthState => ({
  id: SESSION.userId,
  email: SESSION.email,
  role,
  hasProfile,
});

const expectRedirectTo = async (fn: () => Promise<unknown>, target: string) => {
  try {
    await fn();
    expect.unreachable(`expected a redirect to ${target}`);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(RedirectError);
    expect((error as InstanceType<typeof RedirectError>).to).toBe(target);
  }
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("requireUser", () => {
  it("redirects logged-out callers to /signin", async () => {
    mockGetSession.mockResolvedValue(null);
    await expectRedirectTo(() => requireUser(), "/signin");
  });

  it("redirects sessions with no account row to the role chooser", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockGetUserAuthState.mockResolvedValue(null);
    await expectRedirectTo(() => requireUser(), "/onboarding");
  });

  it("returns the session and account when both exist", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockGetUserAuthState.mockResolvedValue(state("FREELANCER", true));
    const result = await requireUser();
    expect(result.session).toEqual(SESSION);
    expect(result.user.role).toBe("FREELANCER");
  });
});

describe("requireRole", () => {
  it("redirects logged-out callers to /signin", async () => {
    mockGetSession.mockResolvedValue(null);
    await expectRedirectTo(() => requireRole("RECRUITER"), "/signin");
  });

  it("sends a freelancer hitting recruiter territory to their own dashboard", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockGetUserAuthState.mockResolvedValue(state("FREELANCER", true));
    await expectRedirectTo(() => requireRole("RECRUITER"), "/dashboard/freelancer");
  });

  it("sends a freelancer without a profile to their onboarding instead", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockGetUserAuthState.mockResolvedValue(state("FREELANCER", false));
    await expectRedirectTo(() => requireRole("RECRUITER"), "/onboarding/freelancer");
  });

  it("sends a non-admin asking for ADMIN to their own dashboard", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockGetUserAuthState.mockResolvedValue(state("RECRUITER", true));
    await expectRedirectTo(() => requireRole("ADMIN"), "/dashboard/recruiter");
  });

  it("passes a matching role through", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockGetUserAuthState.mockResolvedValue(state("RECRUITER", true));
    const result = await requireRole("RECRUITER");
    expect(result.user.role).toBe("RECRUITER");
  });

  it("passes an admin asking for ADMIN through", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockGetUserAuthState.mockResolvedValue(state("ADMIN", true));
    const result = await requireRole("ADMIN");
    expect(result.user.role).toBe("ADMIN");
  });
});

describe("getCurrentProfile", () => {
  it("is null when logged out", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(await getCurrentProfile()).toBeNull();
  });

  it("is null while onboarding is incomplete", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockGetUserAuthState.mockResolvedValue(state("FREELANCER", false));
    mockFreelancerProfile.mockResolvedValue(null);
    expect(await getCurrentProfile()).toBeNull();
  });

  it("returns the role-specific profile once it exists", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockGetUserAuthState.mockResolvedValue(state("RECRUITER", true));
    const profile = { id: "rec_1", companyName: "Acme" };
    mockRecruiterProfile.mockResolvedValue(
      profile as Awaited<ReturnType<typeof getRecruiterProfileByUserId>>,
    );
    const current = await getCurrentProfile();
    expect(current).not.toBeNull();
    expect(current?.role).toBe("RECRUITER");
  });
});
