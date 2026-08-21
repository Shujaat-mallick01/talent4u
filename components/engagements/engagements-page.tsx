import Link from "next/link";

import { EngagementList } from "@/components/engagements/engagement-list";
import { ProposeEngagement } from "@/components/engagements/propose-engagement";
import type { EngagementsPage as EngagementsPageData } from "@/lib/services/engagement";

import { NOTICE_CLASSES } from "@/app/dashboard/recruiter/notices";
import { resolveEngagementNotice } from "@/app/dashboard/engagements/notices";

/**
 * The engagements screen. Identical for both roles by design — the rule it
 * exists to serve is symmetrical: neither side's word alone counts, and
 * neither side can review the other until both have confirmed.
 */
export function EngagementsScreen({
  data,
  noticeCode,
  backHref,
}: {
  data: EngagementsPageData;
  noticeCode: string | undefined;
  backHref: string;
}) {
  const notice = resolveEngagementNotice(noticeCode);
  const awaitingYou = data.cards.filter((c) => c.canRespond).length;
  const toReview = data.cards.filter((c) => c.canReview).length;

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <nav className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <Link href={backHref} className="hover:text-foreground">
            ← Dashboard
          </Link>
        </nav>

        <header className="mb-6 border-b border-border pb-4">
          <h1 className="text-2xl font-bold tracking-tight">Engagements</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            We hold no payment data, so we do not pretend to know that work happened. Instead both
            sides state the rate and duration and confirm it. That mutual confirmation is what
            unlocks reviews — one side alone can never publish a review of the other.
          </p>
          {awaitingYou > 0 || toReview > 0 ? (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
              {awaitingYou > 0
                ? `${awaitingYou} waiting on you to confirm`
                : null}
              {awaitingYou > 0 && toReview > 0 ? " · " : null}
              {toReview > 0 ? `${toReview} ready to review` : null}
            </p>
          ) : null}
        </header>

        {notice ? (
          <p
            role="status"
            className={`mb-6 rounded-[2px] border px-3 py-2 text-sm ${NOTICE_CLASSES[notice.tone]}`}
          >
            {notice.message}
          </p>
        ) : null}

        <section className="mb-10">
          <EngagementList cards={data.cards} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Record an engagement</h2>
          <ProposeEngagement applications={data.proposable} side={data.side} />
        </section>
      </div>
    </main>
  );
}
