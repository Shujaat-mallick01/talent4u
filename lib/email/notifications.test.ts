import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ sendEmail: vi.fn() }));

import { sendEmail } from "./client";
import {
  notifyApplicationDecision,
  notifyEngagementProposed,
  notifyJobHeld,
  notifyNewApplication,
  notifyNewMessage,
  notifyVerificationDecision,
} from "./notifications";

const mockSend = vi.mocked(sendEmail);

const sent = () => mockSend.mock.calls[0][0];

beforeEach(() => {
  vi.resetAllMocks();
  mockSend.mockResolvedValue({ ok: true, id: "e1", skipped: false });
});

const application = {
  to: "hiring@acme.test",
  companyName: "Acme",
  jobTitle: "Senior React engineer",
  jobId: "job_1",
  freelancerName: "Nadia El-Sherif",
  freelancerHeadline: "Frontend engineer, 8 years",
  proposedRateUsd: 74,
  coverLetterExcerpt: "I built the checkout you linked to.",
};

describe("every email", () => {
  it("carries a plain-text alternative as well as HTML", async () => {
    await notifyNewApplication(application);
    expect(sent().text.length).toBeGreaterThan(0);
    expect(sent().html).toContain("<!doctype html>");
  });

  it("says why this person is receiving it", async () => {
    await notifyNewApplication(application);
    // The line that separates a notification from spam in a reader's head.
    expect(sent().html).toContain("You are receiving this because");
    expect(sent().text).toContain("You are receiving this because");
  });

  it("repeats the 0% commission promise, which is also a scam warning", async () => {
    await notifyNewApplication(application);
    expect(sent().html).toContain("never ask you to pay to apply");
  });

  it("escapes user-controlled text rather than interpolating it raw", async () => {
    // A display name is attacker-controlled. An email client that renders the
    // HTML must not be handed a live tag.
    await notifyNewApplication({
      ...application,
      freelancerName: '<img src=x onerror="alert(1)">',
    });
    expect(sent().html).not.toContain("<img src=x");
    expect(sent().html).toContain("&lt;img src=x");
  });

  it("escapes a quoted body too", async () => {
    await notifyNewMessage({
      to: "dev@x.test",
      senderName: "Acme",
      jobTitle: null,
      conversationId: "c1",
      excerpt: "<script>steal()</script>",
    });
    expect(sent().html).not.toContain("<script>");
    expect(sent().html).toContain("&lt;script&gt;");
  });
});

describe("new application", () => {
  it("names the applicant and the job in the subject", async () => {
    await notifyNewApplication(application);
    expect(sent().subject).toBe("Nadia El-Sherif applied to Senior React engineer");
  });

  it("includes the proposed rate when there is one, and omits it when there is not", async () => {
    await notifyNewApplication(application);
    expect(sent().html).toContain("$74");

    mockSend.mockClear();
    await notifyNewApplication({ ...application, proposedRateUsd: null });
    expect(sent().html).not.toContain("Proposed rate");
  });
});

describe("application decisions", () => {
  const base = {
    to: "dev@x.test",
    freelancerName: "Nadia",
    jobTitle: "Senior React engineer",
    jobSlug: "senior-react-engineer",
    companyName: "Acme",
  };

  it("tells a shortlisted applicant what happens next", async () => {
    await notifyApplicationDecision({ ...base, decision: "SHORTLISTED" });
    expect(sent().subject).toContain("shortlisted");
    expect(sent().html).toContain("message");
  });

  it("turns someone down without blaming them, and says the slot returns", async () => {
    await notifyApplicationDecision({ ...base, decision: "REJECTED" });
    const { html, text } = sent();
    expect(html).toContain("frees up 30 days");
    // Never implies the applicant did something wrong.
    expect(text.toLowerCase()).not.toContain("unfortunately");
    expect(text.toLowerCase()).not.toContain("sorry");
  });
});

describe("engagement proposed", () => {
  it("states the exact figures the recipient is being asked to agree to", async () => {
    await notifyEngagementProposed({
      to: "dev@x.test",
      proposerName: "Acme",
      jobTitle: "Build the checkout",
      statedRateUsd: 4000,
      durationWeeks: 6,
      dashboardPath: "/dashboard/freelancer/engagements",
    });
    const { html, text } = sent();
    expect(html).toContain("$4,000");
    expect(html).toContain("6 weeks");
    // And that declining is final — the thing the product cannot undo.
    expect(html).toContain("cannot be filed at you again");
    expect(text).toContain("Nothing publishes until you agree");
  });
});

describe("a held post", () => {
  it("explains the hold without accusing the recruiter", async () => {
    await notifyJobHeld({ to: "hiring@acme.test", jobTitle: "Senior React engineer" });
    const { html } = sent();
    expect(html).toContain("not an accusation");
    expect(html).toContain("Most held posts publish unchanged");
  });
});

describe("verification", () => {
  it("tells an approved company exactly what changed", async () => {
    await notifyVerificationDecision({ to: "a@x.test", companyName: "Acme", approved: true });
    const { html } = sent();
    expect(html).toContain("one-post cap is lifted");
    expect(html).toContain("start conversations");
  });

  it("passes the admin's note through on a rejection, since that is the whole point", async () => {
    await notifyVerificationDecision({
      to: "a@x.test",
      companyName: "Acme",
      approved: false,
      note: "The registration number does not match the domain.",
    });
    expect(sent().html).toContain("The registration number does not match the domain.");
  });
});

describe("failure handling", () => {
  it("reports a send failure without throwing", async () => {
    mockSend.mockResolvedValue({ ok: false, error: "Resend 500" });
    // A mail outage must never propagate into the caller's request.
    await expect(notifyJobHeld({ to: "a@x.test", jobTitle: "Role" })).resolves.toMatchObject({
      ok: false,
    });
  });
});
