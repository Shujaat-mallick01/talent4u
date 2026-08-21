import { EngagementList } from "@/components/engagements/engagement-list";
import { ProposeEngagement } from "@/components/engagements/propose-engagement";
import type { EngagementsPage as EngagementsPageData } from "@/lib/services/engagement";

import { Notice } from "@/components/ui/notice";
import { resolveEngagementNotice } from "@/app/dashboard/engagements/notices";

/**
 * The engagements screen. Identical for both roles by design — the rule it
 * exists to serve is symmetrical: neither side's word alone counts, and
 * neither side can review the other until both have confirmed.
 */
export function EngagementsScreen({
  data,
  noticeCode,
}: {
  data: EngagementsPageData;
  noticeCode: string | undefined;
}) {
  const notice = resolveEngagementNotice(noticeCode);
  const awaitingYou = data.cards.filter((c) => c.canRespond).length;
  const toReview = data.cards.filter((c) => c.canReview).length;

  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        <header className="mb-6 border-b border-border pb-4">
          <h1 className="t-heading">Engagements</h1>
          <p className="mt-2 measure text-[15px] leading-[22px] text-muted-foreground">
            We hold no payment data, so we do not pretend to know that work happened. Instead both
            sides state the rate and duration and confirm it. That mutual confirmation is what
            unlocks reviews — one side alone can never publish a review of the other.
          </p>
          {awaitingYou > 0 || toReview > 0 ? (
            <p className="t-label mt-3 text-primary">
              {awaitingYou > 0 ? `${awaitingYou} waiting on you to confirm` : null}
              {awaitingYou > 0 && toReview > 0 ? " · " : null}
              {toReview > 0 ? `${toReview} ready to review` : null}
            </p>
          ) : null}
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="mb-6">
            {notice.message}
          </Notice>
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
