import type {
  FreelancerVerification,
  JobStatus,
  RecruiterTier,
} from "@/lib/generated/prisma/enums";

/**
 * Verification/tier/status badge specs. Pure so the mappings are unit-tested
 * and shared by every surface. CLAUDE.md requires the recruiter tier label to
 * be visible everywhere and never softened — an UNVERIFIED company is always
 * labeled.
 */

export type BadgeTone = "muted" | "blue" | "gold" | "green" | "red";

export type BadgeSpec = {
  label: string;
  tone: BadgeTone;
  /** Longer explanation, used as a title/tooltip. */
  title: string;
};

export function recruiterTierBadge(tier: RecruiterTier): BadgeSpec {
  switch (tier) {
    case "TRUSTED":
      return {
        label: "Trusted",
        tone: "gold",
        title: "Verified, plus 3+ confirmed engagements with distinct freelancers.",
      };
    case "VERIFIED":
      return {
        label: "Verified",
        tone: "blue",
        title: "Business email, company registration, and LinkedIn confirmed.",
      };
    case "UNVERIFIED":
    default:
      return {
        label: "Unverified",
        tone: "muted",
        title: "Email only. This employer has not completed verification.",
      };
  }
}

export function jobStatusBadge(status: JobStatus): BadgeSpec {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", tone: "green", title: "Live and receiving applications." };
    case "PENDING_REVIEW":
      return {
        label: "In review",
        tone: "gold",
        title: "Held by the automated safety check for human review. It still occupies a post slot.",
      };
    case "DRAFT":
      return { label: "Draft", tone: "muted", title: "Not published. Only you can see it." };
    case "CLOSED":
      return { label: "Closed", tone: "muted", title: "No longer accepting applications." };
    case "REMOVED":
    default:
      return { label: "Removed", tone: "red", title: "Removed by moderation." };
  }
}

export function freelancerVerificationBadge(v: FreelancerVerification): BadgeSpec {
  switch (v) {
    case "ID_AND_WORK_VERIFIED":
      return {
        label: "ID + work verified",
        tone: "green",
        title: "Government ID and at least one linked proof of work confirmed.",
      };
    case "ID_VERIFIED":
      return {
        label: "ID verified",
        tone: "blue",
        title: "Government ID confirmed.",
      };
    case "NONE":
    default:
      return {
        label: "Not verified",
        tone: "muted",
        title: "This freelancer has not completed identity verification.",
      };
  }
}
