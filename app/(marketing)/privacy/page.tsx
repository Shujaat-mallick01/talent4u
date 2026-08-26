import type { Metadata } from "next";
import Link from "next/link";

import { Notice } from "@/components/ui/notice";
import { SITE_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * Privacy, describing what the code actually does today.
 *
 * Every claim here is checkable against the repository: the columns we store,
 * the three processors we call, the absence of any analytics or advertising
 * script, and what deactivation does and does not delete. Nothing is written
 * in the future tense unless it is marked as not yet built — a privacy page
 * that describes a system you have not shipped is the same lie as a fake
 * verification badge.
 */

const LAST_UPDATED = "22 August 2026";

/**
 * Placeholder mailbox. Duplicated on /contact — both pages are owned by this
 * stream and there is no shared config file for it yet; when one exists, this
 * constant moves there.
 */
const SUPPORT_EMAIL = "support@talent4u.example";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Talent4u collects, what it never collects, and who processes it. No payment data, no advertising trackers, no selling anything to anyone.",
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

const LINK =
  "rounded-xs underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Section = { id: string; title: string; body: React.ReactNode };

const SECTIONS: Section[] = [
  {
    id: "short-version",
    title: "The short version",
    body: (
      <>
        <p>
          We collect what the product needs to work: an email address, whatever you write on your
          profile or in a job post, your country, and the applications and messages you send. That is
          nearly all of it.
        </p>
        <p>
          We hold no card numbers and no bank details, because we never touch the money between you
          and the person you work with. We run no advertising trackers and no third-party analytics.
          We do not sell anything about you to anyone, and there is no arrangement under which we
          would.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect today",
    body: (
      <>
        <ul className="space-y-2 pl-5">
          <li className="list-disc">
            <strong className="font-semibold">Account</strong> — your email address, whether it is
            confirmed, whether you are a freelancer or a company, and the country your billing band
            is worked out from.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">Profile</strong> — everything you type into it. For a
            freelancer: name, headline, biography, hourly rate, country, timezone, skills, and the
            GitHub, portfolio or LinkedIn links you add. For a company: company name, domain,
            registration number, website, logo and description.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">Work you do here</strong> — job posts, applications and
            their cover letters, messages between you and the other party, engagements either side
            files, and reviews once both sides confirm.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">Safety records</strong> — reports you file about a post
            or a person, and flags our automated scanner raises on posts and messages, with the term
            that matched. These are how the moderation queue and{" "}
            <Link href="/removed-employers" className={LINK}>
              the removed employers page
            </Link>{" "}
            work.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">Verification material</strong> — for companies, the
            domain, registration number and LinkedIn page a moderator checks, plus the decision and
            any note explaining it. Government-ID checks for freelancers are not live yet; when they
            are, an identity provider performs the check and we keep its result, not your document.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "what-we-do-not",
    title: "What we do not collect",
    body: (
      <>
        <ul className="space-y-2 pl-5">
          <li className="list-disc">
            <strong className="font-semibold">No payment data.</strong> No escrow, no wallet, no
            payouts, no invoices passing through us — so there is no card number, IBAN or payment
            history of yours in our database. When subscription billing launches, the payment
            processor handles the card and we store its customer reference and the plan, nothing
            more.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">No advertising or analytics trackers.</strong> There is
            no Google Analytics, no advertising pixel, no session recorder and no third-party script
            of any kind on these pages. You can check with your browser’s network tab, which is the
            only kind of privacy claim worth making.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">No data broking.</strong> We do not sell, rent or
            trade personal data. Our income is subscriptions; that is the entire business model, and
            it is why we can say this without a carve-out.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "public",
    title: "What is public on purpose",
    body: (
      <>
        <p>
          Job posts, company pages and freelancer profiles are public web pages. They are meant to be
          found by search engines — that is how a commission-free marketplace reaches people without
          buying ads — so they appear in{" "}
          <Link href="/freelancers" className={LINK}>
            the freelancer index
          </Link>
          , the job listings, and our sitemap. Reviews are public too, attached to the profile they
          are about.
        </p>
        <p>
          What is never public: your email address, your messages, your applications and their cover
          letters, and anything you send us about a report. Write your profile as though the whole
          internet will read it, because it can.
        </p>
      </>
    ),
  },
  {
    id: "processors",
    title: "Who else handles it",
    body: (
      <>
        <p>Three companies process data on our behalf. There is no fourth.</p>
        <ul className="space-y-2 pl-5">
          <li className="list-disc">
            <strong className="font-semibold">Supabase</strong> — sign-in and the database. Your
            account, profile and everything you write here lives there.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">Resend</strong> — the transactional email we send you:
            an application received, a message waiting, a verification decision. No marketing blasts.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">Vercel</strong> — hosting. Serving a page means their
            infrastructure sees the request, including your IP address, in the ordinary way any web
            host does.
          </li>
        </ul>
        <p>
          When card billing and identity verification launch, the payment processor and identity
          provider join this list, and this page will name them before they are switched on.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        One kind: the sign-in cookie that keeps you logged in, set by our authentication provider. It
        is not used to follow you anywhere, and there is nothing else to consent to — which is why
        this site has no cookie banner nagging you to accept trackers it does not run.
      </p>
    ),
  },
  {
    id: "deactivation",
    title: "Deactivating, and what stays",
    body: (
      <>
        <p>
          Taking your page down removes it from the site, from the freelancer index and from our
          sitemap. Requested afresh, the URL answers exactly as it would for a profile that never
          existed — we do not publish “this profile was withdrawn”, because that would confirm to the
          entire web that it existed and was withdrawn.
        </p>
        <p>
          What stays is the record shared with someone else: applications you sent, messages both
          sides can still read, engagements both sides confirmed, and reviews other people wrote.
          Deleting those would rewrite another person’s history of work they did, so we keep them.
        </p>
        <p>
          If you want more than deactivation — a full erasure, a copy of what we hold, or a
          correction — write to us and say which. We will tell you what we can do, what we cannot,
          and why, in the reply rather than after a form.
        </p>
      </>
    ),
  },
  {
    id: "removal-requests",
    title: "Asking us to remove something",
    body: (
      <>
        <p>
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address on the account, and name the page or the record. If it is about someone
          else’s content — a post using your company’s name, a review you believe is fabricated — send
          the link and what is wrong with it.{" "}
          <Link href="/contact" className={LINK}>
            The contact page
          </Link>{" "}
          lists what to include, and flags that this mailbox is a placeholder until the live one is
          open.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <p>
        When what we collect changes, this page changes first and the date at the top changes with
        it. If we ever start collecting something materially new, registered accounts get an email —
        not a silent edit.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-[var(--container-marketing)] px-6 py-10">
        <header className="pb-6">
          <p className="t-label text-muted-foreground">Legal</p>
          <h1 className="t-display-2 mt-2">Privacy</h1>
          <p className="t-body  mt-3 text-muted-foreground">
            What we collect, what we refuse to collect, and who else sees it. Short, because there is
            not much of it.
          </p>
          <p className="t-label mt-4 text-muted-foreground">Last updated {LAST_UPDATED}</p>
        </header>

        <Notice tone="warning" className="mt-6">
          This is a plain-language draft, not a lawyer-reviewed privacy policy. It describes what the
          product does today and will be reviewed before we take payments or run identity checks. The
          date above changes when it does.
        </Notice>

        <nav aria-labelledby="toc-heading" className="mt-8">
          <h2 id="toc-heading" className="t-label text-muted-foreground">
            On this page
          </h2>
          <ol className="rowset mt-3">
            {SECTIONS.map((section, i) => (
              <li key={section.id}>
                <Link
                  href={`#${section.id}`}
                  className={cn(
                    "row-hover flex items-baseline gap-4 px-4 py-2.5 text-[15px] leading-[22px] hover:underline",
                    "rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  <span className="t-data shrink-0 text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">{section.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        {SECTIONS.map((section, i) => (
          <section
            key={section.id}
            id={section.id}
            className="surface-card mt-5 scroll-mt-20 p-6 sm:p-7"
          >
            <p className="t-label text-muted-foreground">
              Section {String(i + 1).padStart(2, "0")}
            </p>
            <h2 className="t-heading mt-2">{section.title}</h2>
            <div className="t-body  mt-4 space-y-4">{section.body}</div>
          </section>
        ))}

        <footer className="mt-10 border-t border-border pt-6">
          <p className="t-body-dense  text-muted-foreground">
            The rules for using the site are on{" "}
            <Link href="/terms" className={LINK}>
              the terms page
            </Link>
            , including what gets a company removed and why reviews stay locked until both sides
            confirm.
          </p>
        </footer>
        </div>
    </main>
  );
}
