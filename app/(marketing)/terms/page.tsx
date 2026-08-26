import type { Metadata } from "next";
import Link from "next/link";

import { Notice } from "@/components/ui/notice";
import { SITE_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * Terms of use, written to be read.
 *
 * Two rules govern this page. First, it says only what is true today: no
 * invented company registration, no jurisdiction we have not chosen, no
 * arbitration clause copied from a template, and a visible line saying this is
 * a plain-language draft pending legal review. Second, it says what actually
 * gets a company removed — /removed-employers refers to "the rules every
 * company agrees to when they post", and this is where those rules live.
 */

const LAST_UPDATED = "22 August 2026";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "The rules for using Talent4u, in plain language: we match, verify and publish reputation. We never hold your money, and we never take a percentage of what you earn.",
  alternates: { canonical: `${SITE_URL}/terms` },
  robots: { index: true, follow: true },
};

const LINK =
  "rounded-xs underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Section = { id: string; title: string; body: React.ReactNode };

const SECTIONS: Section[] = [
  {
    id: "what-this-is",
    title: "What Talent4u is",
    body: (
      <>
        <p>
          Talent4u is a place to find work and to find people. Companies publish roles, freelancers
          apply, and the two sides talk to each other. That is the whole of the service: matching,
          verification, reputation and discovery.
        </p>
        <p>
          We take 0% of anyone’s earnings. Our income is subscriptions, which is why we can say that
          and mean it — there is no percentage of your invoice anywhere in our business model.
        </p>
      </>
    ),
  },
  {
    id: "not-a-party",
    title: "We are not a party to your work",
    body: (
      <>
        <p>
          When you agree to work with someone you met here, that agreement is between the two of
          you. We are not your employer, your client, your agent or your guarantor, and we are not a
          party to whatever you sign.
        </p>
        <p>Concretely, and without exception:</p>
        <ul className="space-y-2 pl-5">
          <li className="list-disc">
            <strong className="font-semibold">We never hold your money.</strong> There is no escrow,
            no wallet, no payout and no card of yours on file for paying each other. You invoice and
            pay each other directly, by whatever method you both accept.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">We do not arbitrate disputes.</strong> If work goes
            wrong or an invoice goes unpaid, we cannot rule on it, release funds we never held, or
            compel anyone to do anything. Tell us anyway — a pattern of complaints is evidence we
            act on under the removal rules below.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">We do not police contact details.</strong> Swap emails,
            phone numbers and calendars the day you meet if you like. Most marketplaces forbid this
            because it protects their commission. We do not have a commission to protect.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">We guarantee no outcome.</strong> Not a hire, not an
            application reply, not payment, not the quality of anyone’s work.
          </li>
        </ul>
        <p>
          You decide who to work with. Verification badges and reviews are evidence to weigh, not a
          promise from us about a person or a company.
        </p>
      </>
    ),
  },
  {
    id: "your-account",
    title: "Your account",
    body: (
      <>
        <p>
          One account per person, with details that are true: your own name or your company’s real
          name, a working email, and a country. Profiles and job posts are public and indexed by
          search engines — write them expecting strangers to read them, because strangers will.
        </p>
        <p>
          You must be old enough to enter a contract where you live. You are responsible for what
          happens under your login, so keep it to yourself.
        </p>
        <p>
          Freelancer accounts apply to jobs; company accounts post them. The role is fixed when the
          account is created because it decides what the account can do — if you need both, you need
          two accounts with two email addresses.
        </p>
      </>
    ),
  },
  {
    id: "posting-work",
    title: "Rules for companies posting work",
    body: (
      <>
        <p>
          A post must be a real role you intend to fill, described honestly: what the work is, what
          the budget is if you have one, and who you are. Unverified companies are labelled
          Unverified on every post, in plain sight, and are capped at one live role at a time. That
          label is not softened, ever, and no plan removes it — verification does.
        </p>
        <p>
          Posts are scanned before publication, not after. A post that matches a known scam pattern
          is held for a human to read, which takes as long as it takes; nothing about the delay is a
          judgement of you until a person has looked.
        </p>
      </>
    ),
  },
  {
    id: "removal",
    title: "What gets a company removed",
    body: (
      <>
        <p>
          Any of these ends a company’s access, and the removal is published with its reason on{" "}
          <Link href="/removed-employers" className={LINK}>
            our removed employers page
          </Link>
          . We publish removals because a marketplace that moderates in private is asking you to
          take its word for it.
        </p>
        <ul className="space-y-2 pl-5">
          <li className="list-disc">
            Asking an applicant for money. A registration fee, a security deposit, a training fee, an
            equipment purchase, a processing fee — under any name. Nobody should ever pay to be
            considered for work.
          </li>
          <li className="list-disc">
            Unpaid test work beyond about four hours. A short exercise is fair; a free deliverable is
            not.
          </li>
          <li className="list-disc">
            Moving a payment request to a payment-app handle off the platform, which is the shape
            nearly every advance-fee scam takes.
          </li>
          <li className="list-disc">
            Pretending to be a company you are not, or using a company’s name, registration number or
            domain without the right to.
          </li>
          <li className="list-disc">
            Posting roles that do not exist — collecting CVs, ID documents or contact lists under the
            cover of hiring.
          </li>
          <li className="list-disc">
            Harassment, threats, or asking for identity documents and bank details as a condition of
            applying.
          </li>
        </ul>
        <p>
          Removal is our decision under these rules. It is not a court finding, and we say so on the
          page itself. When a company is removed its posts go with it, and the reviews other people
          wrote stay — that history is not ours to delete.
        </p>
      </>
    ),
  },
  {
    id: "applying",
    title: "Rules for freelancers",
    body: (
      <>
        <p>
          Apply as yourself, for work you can actually do. A profile that claims someone else’s
          portfolio, or an application written for a role you have not read, wastes the one thing a
          small marketplace runs on, which is a company believing that applications here are worth
          opening.
        </p>
        <p>
          Free accounts get 12 applications every rolling 30 days. The count is enforced on our
          servers, not in the interface, and withdrawing an application does not give the slot back —
          otherwise apply-and-withdraw would be an unlimited plan. Pro removes the limit.
        </p>
        <p>
          Never pay to apply for anything, here or anywhere. If a company on Talent4u asks you for
          money, report the post and we will act on it.
        </p>
      </>
    ),
  },
  {
    id: "verification",
    title: "Verification and badges",
    body: (
      <>
        <p>A badge states exactly what we checked, and nothing more.</p>
        <ul className="space-y-2 pl-5">
          <li className="list-disc">
            <strong className="font-semibold">Unverified</strong> — a company confirmed an email
            address. That is all it means, and it is written on every post they publish.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">Verified</strong> — a business domain email, a company
            registration number and a matching LinkedIn page, checked by a person.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">Trusted</strong> — verified, plus three engagements
            confirmed by three different freelancers.
          </li>
          <li className="list-disc">
            <strong className="font-semibold">Freelancer verification</strong> — government ID
            through our identity provider, plus at least one linked proof of work such as a GitHub
            account, a portfolio domain or a LinkedIn profile.
          </li>
        </ul>
        <p>
          Giving us false verification details ends the account. If something we verified stops being
          true, tell us and we will change the badge.
        </p>
      </>
    ),
  },
  {
    id: "reviews",
    title: "Reviews, and why they are locked",
    body: (
      <>
        <p>
          We hold no payment data, so we cannot prove work happened. Instead, both sides confirm the
          engagement — the rate and how long it ran — and only then can either write a review of the
          other. One side alone can never publish a review, and neither can anyone who was not on the
          engagement.
        </p>
        <p>
          The trade is deliberate: fewer reviews than a site that lets anyone post one, and every
          review here backed by two people agreeing they worked together. Reviews must be your own
          honest account of that work. We remove ones that are traded, bought, or written about
          something that never happened.
        </p>
      </>
    ),
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    body: (
      <>
        <p>
          Everything essential is free: browsing every job, signed in or not; applying up to the free
          limit; and posting your first role. Paid plans add capacity and tools, never a cut of your
          earnings.{" "}
          <Link href="/pricing" className={LINK}>
            The pricing page
          </Link>{" "}
          shows the current amounts at your billing country’s band — prices differ by purchasing
          power, and your billing country decides which band you are in.
        </p>
        <p>
          Card billing is not live yet. Until it is, no plan can charge you and the pricing page says
          so. When it launches, plans will be monthly, cancellable at any time, and will run to the
          end of the period already paid for. If we ever take money for a month you did not mean to
          buy, write to us and we will refund it.
        </p>
      </>
    ),
  },
  {
    id: "ending",
    title: "Deactivating, and being removed",
    body: (
      <>
        <p>
          You can take your public page down at any time from your dashboard. Deactivating hides your
          profile from the site and from search engines; it does not erase applications you sent,
          messages you exchanged, engagements both sides confirmed or reviews other people wrote,
          because that history belongs to two people, not one.{" "}
          <Link href="/privacy" className={LINK}>
            The privacy page
          </Link>{" "}
          explains exactly what stays and how to ask for more than that.
        </p>
        <p>
          We can suspend or remove an account that breaks the rules above. For a company, that is
          published with its reason. For anything involving money taken from a freelancer, we act
          first and discuss afterwards.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes, and the law that applies",
    body: (
      <>
        <p>
          When these terms change we update the date at the top of this page and say what changed. If
          a change materially reduces what you get, we will email registered accounts rather than
          leave you to notice.
        </p>
        <p>
          We are not naming a governing law or a court here, because doing so before the company is
          incorporated and the page is lawyer-reviewed would be theatre. When it is settled it will
          be written here, dated, and announced — not quietly inserted.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Reaching us",
    body: (
      <p>
        Questions about these terms, a removal, or anything you think is a scam go to{" "}
        <Link href="/contact" className={LINK}>
          our contact page
        </Link>
        , which lists what to include so the first reply is a useful one.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="pb-6">
          <p className="t-label text-muted-foreground">Legal</p>
          <h1 className="t-display-2 mt-2">Terms of use</h1>
          <p className="t-body measure mt-3 text-muted-foreground">
            What we do, what we refuse to do, and what gets an account removed. Written to be read
            once, in full, by a person who is about to trust strangers with their working time.
          </p>
          <p className="t-label mt-4 text-muted-foreground">Last updated {LAST_UPDATED}</p>
        </header>

        {/* Honesty over pretence: this is a draft, and pretending otherwise on
            a page about trust would be the worst possible place to bluff. */}
        <Notice tone="warning" className="mt-6">
          These terms are a plain-language draft, not a lawyer-reviewed contract. They describe how
          Talent4u actually behaves today, and they will be reviewed by a lawyer before we charge
          anyone. When that happens this page changes and the date above changes with it.
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
            <div className="t-body measure mt-4 space-y-4">{section.body}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
