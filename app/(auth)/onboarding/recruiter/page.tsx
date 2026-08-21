import { redirect } from "next/navigation";

import { getCurrentProfile, requireRole } from "@/lib/auth/guards";

import { RecruiterOnboardingForm } from "./onboarding-form";

import { isConsumerEmailDomain } from "@/lib/config/consumer-email-domains";

// Consumer providers are not a company domain, so don't prefill from them.
// The list is shared with verification (one source of truth) — a domain that
// would never satisfy the badge must never be suggested here either.
function companyDomainHint(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  return domain && !isConsumerEmailDomain(domain) ? domain : null;
}

export default async function RecruiterOnboardingPage() {
  const { user } = await requireRole("RECRUITER");
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard/recruiter");

  return (
    <main id="main" className="flex-1">
      <RecruiterOnboardingForm
        email={user.email}
        companyDomainHint={companyDomainHint(user.email)}
      />
    </main>
  );
}
