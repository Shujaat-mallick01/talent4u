import type { RecruiterTier } from "@/lib/generated/prisma/enums";
import { isConsumerEmailDomain, isPublicSuffix } from "@/lib/config/consumer-email-domains";

/**
 * Recruiter verification rules, pure and unit-tested.
 *
 * CLAUDE.md tier table:
 *   UNVERIFIED — email only
 *   VERIFIED   — business domain email + company registration number + LinkedIn
 *   TRUSTED    — VERIFIED **plus** 3 mutually confirmed engagements
 *
 * (BUILD_PLAN 4.1 phrases the last one as "UNVERIFIED -> TRUSTED"; the tier
 * table is the invariant, so TRUSTED is only ever reachable from VERIFIED.)
 *
 * "Business domain email" is checked against the recruiter's Supabase-verified
 * ACCOUNT email — the one address we know they control. Claiming a domain you
 * cannot receive mail at proves nothing, so the account email's host must be
 * the company domain (or a subdomain of it), and consumer mailbox providers
 * never count.
 */

export const TRUSTED_ENGAGEMENT_THRESHOLD = 3;

/** The host of an email address, lowercased. Null when it isn't one address. */
export function emailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  if (trimmed.slice(0, at).includes("@")) return null; // two @ = not an address
  const host = trimmed.slice(at + 1);
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)
    ? host
    : null;
}

/**
 * True when `email` is at `domain` or a subdomain of it, and the domain is a
 * real business domain (not a consumer mailbox provider).
 */
export function emailProvesDomain(email: string, domain: string | null): boolean {
  if (!domain) return false;
  const target = domain.trim().toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
  // Nobody owns a bare TLD or a public suffix: claiming "co.uk" would
  // otherwise let any @something.co.uk mailbox satisfy the subdomain rule.
  if (target === "" || isPublicSuffix(target) || isConsumerEmailDomain(target)) return false;
  const host = emailDomain(email);
  if (!host) return false;
  // A consumer mailbox never proves a business domain, even via subdomain
  // (jane@mail.yahoo.com must not prove "yahoo.com" — already covered above —
  // nor any other claim).
  if (isConsumerEmailDomain(host)) return false;
  return host === target || host.endsWith(`.${target}`);
}

export type VerificationRequirement = {
  key: "domainEmail" | "registrationNo" | "linkedinUrl";
  label: string;
  met: boolean;
  hint: string;
};

export type VerificationReadiness = {
  requirements: VerificationRequirement[];
  /** Every requirement satisfied — the submission may be sent for review. */
  ready: boolean;
};

/**
 * Which of the three VERIFIED requirements this recruiter currently meets.
 * Presentation reads this; submission enforces it.
 */
export function verificationReadiness(input: {
  accountEmail: string;
  /** Whether that address is confirmed. An unconfirmed one proves nothing. */
  accountEmailVerified?: boolean;
  companyDomain: string | null;
  registrationNo: string | null;
  linkedinUrl: string | null;
}): VerificationReadiness {
  const emailConfirmed = input.accountEmailVerified !== false;
  const requirements: VerificationRequirement[] = [
    {
      key: "domainEmail",
      label: "Business domain email",
      met: emailConfirmed && emailProvesDomain(input.accountEmail, input.companyDomain),
      hint: emailConfirmed
        ? "Your account email must be at your company domain — sign in with it, or add the domain that matches it. Free mailbox providers don't count."
        : "Confirm your account email first: the domain only proves something once we know you receive mail there.",
    },
    {
      key: "registrationNo",
      label: "Company registration number",
      met: (input.registrationNo ?? "").trim().length >= 2,
      hint: "The number your company is registered under in its country.",
    },
    {
      key: "linkedinUrl",
      label: "Company LinkedIn",
      met: (input.linkedinUrl ?? "").trim().length > 0,
      hint: "A LinkedIn company page a reviewer can match to your name and domain.",
    },
  ];
  return { requirements, ready: requirements.every((r) => r.met) };
}

/**
 * Whether a recruiter qualifies for TRUSTED: VERIFIED, plus confirmed
 * engagements with at least 3 DISTINCT freelancers (distinct is what stops a
 * recruiter and one accomplice manufacturing the badge).
 */
export function qualifiesForTrusted(tier: RecruiterTier, distinctConfirmedFreelancers: number): boolean {
  return tier === "VERIFIED" && distinctConfirmedFreelancers >= TRUSTED_ENGAGEMENT_THRESHOLD;
}
