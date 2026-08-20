import { redirect } from "next/navigation";

import { getCurrentProfile, requireRole } from "@/lib/auth/guards";

import { RecruiterOnboardingForm } from "./onboarding-form";

// Consumer providers are not a company domain, so don't prefill from them.
const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
]);

function companyDomainHint(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  return domain && !CONSUMER_EMAIL_DOMAINS.has(domain) ? domain : null;
}

export default async function RecruiterOnboardingPage() {
  const { user } = await requireRole("RECRUITER");
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard/recruiter");

  return (
    <main className="flex-1">
      <RecruiterOnboardingForm
        email={user.email}
        companyDomainHint={companyDomainHint(user.email)}
      />
    </main>
  );
}
