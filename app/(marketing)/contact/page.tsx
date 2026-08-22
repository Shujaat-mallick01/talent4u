import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { IconFlag } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { SITE_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * Contact.
 *
 * A marketplace that takes government ID and card details and offers no way to
 * reach a human reads exactly like the sites the safety scanner exists to
 * catch. This page is the answer to that, so it is specific about three
 * things: where each kind of message goes, what to put in it so the first
 * reply is useful, and what we cannot do however politely you ask.
 */

/**
 * Placeholder mailbox, marked as such on the page. Duplicated on /privacy —
 * both pages belong to this stream and there is no shared contact config yet;
 * when there is, this constant moves there.
 */
const SUPPORT_EMAIL = "support@talent4u.example";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to reach Talent4u: support, scam reports, removal and privacy requests, and what to include so the first reply is a useful one.",
  alternates: { canonical: `${SITE_URL}/contact` },
  robots: { index: true, follow: true },
};

const LINK =
  "rounded-[2px] underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** One route: what you want, and where it actually goes. */
const ROUTES: { term: string; body: React.ReactNode }[] = [
  {
    term: "A post asking you for money",
    body: (
      <>
        Report it from the post itself — the report control sits on every job page and company page,
        and it carries the link and the employer with it, so nothing has to be described from memory.
        Then, if money has already changed hands, email us as well.
      </>
    ),
  },
  {
    term: "Something broken on the site",
    body: (
      <>
        Email us with the page address, what you expected to happen and what happened instead. If it
        involves your account, write from the address the account uses — we cannot discuss an account
        with an unverified stranger.
      </>
    ),
  },
  {
    term: "Verification, badges or a held post",
    body: (
      <>
        Email us. Held posts are read by a person, in order; a message asking us to look does not
        move the queue, but a message correcting something we got wrong does.
      </>
    ),
  },
  {
    term: "Removal, correction or a copy of your data",
    body: (
      <>
        Email us and say which of the three you want.{" "}
        <Link href="/privacy" className={LINK}>
          The privacy page
        </Link>{" "}
        explains what deactivating already does, and what stays because it is shared with someone
        else.
      </>
    ),
  },
  {
    term: "Anything about money between you and a client",
    body: (
      <>
        We cannot help, and we would rather say so than waste your week. We never hold the payment,
        so we cannot release it, reverse it or rule on it —{" "}
        <Link href="/terms#not-a-party" className={LINK}>
          the terms say exactly this
        </Link>
        . Tell us anyway if a company behaved badly: a pattern is evidence, and it is what gets a
        company removed.
      </>
    ),
  },
];

const INCLUDE = [
  "The link to the page, post or profile you mean.",
  "The email address on your account, if it is about your account.",
  "What you expected, and what happened instead.",
  "Dates and amounts, if money was asked for or promised.",
];

export default function ContactPage() {
  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="border-b border-border pb-6">
          <p className="t-label text-muted-foreground">Support</p>
          <h1 className="t-display-2 mt-2">Contact us</h1>
          <p className="t-body measure mt-3 text-muted-foreground">
            One mailbox, read by the people who build this. Below is where each kind of message goes
            and what to put in it, so the first reply is an answer rather than a request for details.
          </p>
        </header>

        {/* The address is not live yet. Publishing a real-looking one that
            silently bounces would be worse than admitting this. */}
        <Notice tone="warning" className="mt-6">
          <strong className="font-semibold">{SUPPORT_EMAIL}</strong> is a placeholder while the
          mailbox on our own domain is being set up — mail to it will not reach us yet. Scam reports
          do not depend on it: the report control on a job or company page reaches the moderation
          queue directly, today.
        </Notice>

        <p className="t-body measure mt-6">
          Write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
            {SUPPORT_EMAIL}
          </a>{" "}
          — one address for support, verification questions, privacy requests and press. There is no
          contact form, because a form that turns your message into a ticket number is a way of not
          answering it.
        </p>

        <section className="mt-8">
          <h2 className="t-label text-muted-foreground">Where to send what</h2>
          {/* Rows sharing one hairline, never cards floating with gaps. */}
          <dl className="rowset mt-3">
            {ROUTES.map((route) => (
              <div key={route.term} className="row-hover px-4 py-4">
                <dt className="text-[15px] font-semibold leading-[22px]">{route.term}</dt>
                <dd className="t-body-dense measure mt-1.5 text-muted-foreground">{route.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-10 border-t border-border pt-8">
          <h2 className="t-heading">Reporting a scam</h2>
          <p className="t-body measure mt-3">
            The report control lives on the job post and the company page, because that is where the
            evidence is. Open the post you are worried about and use it there — it reaches the same
            moderation queue that holds posts matching known scam patterns before they ever publish.
          </p>
          <p className="t-body-dense measure mt-3 text-muted-foreground">
            Two rules worth keeping whatever a company tells you: never pay to apply — no
            registration fee, deposit, training fee or equipment purchase is ever legitimate — and
            never do more than about four hours of unpaid test work for a stranger.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              render={
                <Link href="/jobs">
                  <IconFlag />
                  Find the post to report
                </Link>
              }
            />
            <Link
              href="/removed-employers"
              className={cn("t-body-dense text-muted-foreground", LINK)}
            >
              See companies we have already removed
            </Link>
          </div>
        </section>

        <section className="mt-10 border-t border-border pt-8">
          <h2 className="t-heading">What to include</h2>
          <ul className="t-body measure mt-3 space-y-2 pl-5">
            {INCLUDE.map((line) => (
              <li key={line} className="list-disc">
                {line}
              </li>
            ))}
          </ul>
          <p className="t-body-dense measure mt-4 text-muted-foreground">
            We are a small team and we will read everything once the mailbox is live — until
            then no reply time is promised, because none is possible. When it is, anything
            involving money taken from a freelancer jumps the queue.
          </p>
        </section>

        <footer className="mt-10 border-t border-border pt-6">
          <p className="t-body-dense measure text-muted-foreground">
            The rules we moderate under are on{" "}
            <Link href="/terms#removal" className={LINK}>
              the terms page
            </Link>
            , and what we collect is on{" "}
            <Link href="/privacy" className={LINK}>
              the privacy page
            </Link>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
