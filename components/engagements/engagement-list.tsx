import Link from "next/link";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { StarRating } from "@/components/profile/star-rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { timeAgo } from "@/lib/format/time";
import { engagementStateBadge, recruiterTierBadge } from "@/lib/profile/badges";
import type { EngagementCard } from "@/lib/services/engagement";
import { formatDuration, formatStatedRate } from "@/lib/validations/engagement";
import { RATING_LABELS } from "@/lib/validations/review";

import {
  amendEngagementTerms,
  confirmEngagement,
  declineEngagement,
  writeReview,
} from "@/app/dashboard/engagements/actions";

/**
 * The engagement list, shared by both dashboards. Which actions render is
 * decided by the service (canRespond / canAmend / canReview), not here —
 * this file only draws what it is told, and every one of those flags is
 * re-checked server-side when the form is submitted.
 */

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

function Terms({ card }: { card: EngagementCard }) {
  const { statedRateUsd, durationWeeks } = card.engagement;
  return (
    <p className="mt-1 text-sm">
      <span className="font-medium">
        {statedRateUsd === null ? "Rate not stated" : formatStatedRate(statedRateUsd)}
      </span>
      {" · "}
      <span className="font-medium">
        {durationWeeks === null ? "Duration not stated" : formatDuration(durationWeeks)}
      </span>
    </p>
  );
}

function TermsFields({
  defaultRate,
  defaultWeeks,
}: {
  defaultRate?: number | null;
  defaultWeeks?: number | null;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Agreed rate (USD)
        </span>
        <Input
          name="statedRateUsd"
          type="number"
          min={1}
          max={100000}
          step={1}
          required
          defaultValue={defaultRate ?? undefined}
          className="mt-1 w-36"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Duration (weeks)
        </span>
        <Input
          name="durationWeeks"
          type="number"
          min={1}
          max={520}
          step={1}
          required
          defaultValue={defaultWeeks ?? undefined}
          className="mt-1 w-32"
        />
      </label>
    </div>
  );
}

function ReviewForm({ card }: { card: EngagementCard }) {
  const subject =
    card.side === "FREELANCER"
      ? card.engagement.recruiter.companyName
      : card.engagement.freelancer.displayName;

  return (
    <form action={writeReview} className="mt-3 border-t border-border pt-3">
      <input type="hidden" name="engagementId" value={card.engagement.id} />
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        Review {subject}
      </p>

      <fieldset className="mt-2">
        <legend className="sr-only">Rating</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {[5, 4, 3, 2, 1].map((value) => (
            <label key={value} className="inline-flex items-center gap-1.5 text-sm">
              <input type="radio" name="rating" value={value} required className="accent-primary" />
              <span aria-hidden className="tracking-tight">
                {"★".repeat(value)}
                <span className="text-muted-foreground/40">{"★".repeat(5 - value)}</span>
              </span>
              <span className="sr-only">
                {value} {value === 1 ? "star" : "stars"} — {RATING_LABELS[value]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Textarea
        name="body"
        rows={3}
        minLength={40}
        maxLength={2000}
        required
        placeholder="What was it like to work together? Specifics help the next person more than praise."
        className="mt-2"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" size="sm">
          Publish review
        </Button>
        <p className="text-xs text-muted-foreground">
          Public on their profile, under your name. You cannot edit it afterwards.
        </p>
      </div>
    </form>
  );
}

function OneEngagement({ card }: { card: EngagementCard }) {
  const { engagement, state } = card;
  const counterparty =
    card.side === "FREELANCER" ? (
      <span className="inline-flex flex-wrap items-center gap-2">
        {/* A removed employer's public page is gone, and their old tier is not
            a recommendation we still stand behind — so neither is shown. */}
        {card.counterpartyRemoved ? (
          <span className="font-semibold">{engagement.recruiter.companyName}</span>
        ) : (
          <Link
            href={`/companies/${engagement.recruiter.slug}`}
            className="font-semibold hover:underline"
          >
            {engagement.recruiter.companyName}
          </Link>
        )}
        {card.counterpartyRemoved ? (
          <span
            title="This employer was removed from Talent4u. See the public removals page."
            className="rounded-[2px] border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-destructive"
          >
            Removed
          </span>
        ) : (
          <ProfileBadge spec={recruiterTierBadge(engagement.recruiter.tier)} />
        )}
      </span>
    ) : (
      <Link
        href={`/freelancers/${engagement.freelancer.slug}`}
        className="font-semibold hover:underline"
      >
        {engagement.freelancer.displayName}
      </Link>
    );

  return (
    <li className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {counterparty}
            <ProfileBadge spec={engagementStateBadge(state)} />
          </div>
          {engagement.job ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{engagement.job.title}</p>
          ) : null}
          <Terms card={card} />
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {state === "CONFIRMED" && engagement.confirmedAt
              ? `Confirmed ${dateFmt.format(engagement.confirmedAt)}`
              : state === "DECLINED" && engagement.declinedAt
                ? `Declined ${dateFmt.format(engagement.declinedAt)}`
                : `Filed ${timeAgo(engagement.createdAt)}`}
          </p>
        </div>

        {card.canRespond ? (
          <div className="flex items-center gap-2">
            {card.canConfirm ? (
              <form action={confirmEngagement}>
                <input type="hidden" name="engagementId" value={engagement.id} />
                {/* The figures on screen travel with the click. If the other
                    side amends them in the meantime, the server refuses rather
                    than recording agreement to numbers never displayed here. */}
                <input type="hidden" name="seenRateUsd" value={engagement.statedRateUsd ?? ""} />
                <input
                  type="hidden"
                  name="seenDurationWeeks"
                  value={engagement.durationWeeks ?? ""}
                />
                <Button type="submit" size="sm">
                  Yes, we worked together
                </Button>
              </form>
            ) : null}
            <form action={declineEngagement}>
              <input type="hidden" name="engagementId" value={engagement.id} />
              <Button type="submit" size="sm" variant="outline">
                No, we didn&apos;t
              </Button>
            </form>
          </div>
        ) : null}
      </div>

      {card.canConfirm ? (
        <p className="mt-2 border-l-2 border-warning/40 pl-3 text-sm text-muted-foreground">
          Confirm only if these figures match what actually happened. Confirming is what unlocks
          reviews between you, and it counts toward this company&apos;s Trusted badge.
        </p>
      ) : null}

      {card.canRespond && !card.termsStated ? (
        <p className="mt-2 border-l-2 border-warning/40 pl-3 text-sm text-muted-foreground">
          This one states no rate and duration, so there is nothing specific to confirm. Ask the
          side that filed it to add the figures, or decline it.
        </p>
      ) : null}

      {card.canRespond && card.counterpartyRemoved ? (
        <p className="mt-2 border-l-2 border-destructive/40 pl-3 text-sm text-muted-foreground">
          This employer has been removed from Talent4u, so this cannot be confirmed. Declining
          clears it from your dashboard.
        </p>
      ) : null}

      {state === "PENDING" && !card.canRespond ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Waiting on{" "}
          {card.side === "FREELANCER"
            ? engagement.recruiter.companyName
            : engagement.freelancer.displayName}{" "}
          to confirm. Nothing is public until they do.
        </p>
      ) : null}

      {card.canAmend ? (
        <details className="mt-3">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">
            Correct the figures
          </summary>
          <form action={amendEngagementTerms} className="mt-2">
            <input type="hidden" name="engagementId" value={engagement.id} />
            <TermsFields
              defaultRate={engagement.statedRateUsd}
              defaultWeeks={engagement.durationWeeks}
            />
            <Button type="submit" size="sm" variant="outline" className="mt-2">
              Update terms
            </Button>
          </form>
        </details>
      ) : null}

      {card.ownReview ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Your review
          </p>
          <div className="mt-1">
            <StarRating value={card.ownReview.rating} count={1} hideCount />
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{card.ownReview.body}</p>
        </div>
      ) : null}

      {card.canReview ? <ReviewForm card={card} /> : null}

      {card.receivedReview ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Their review of you
          </p>
          <div className="mt-1">
            <StarRating value={card.receivedReview.rating} count={1} hideCount />
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
            {card.receivedReview.body}
          </p>
        </div>
      ) : null}
    </li>
  );
}

export function EngagementList({ cards }: { cards: EngagementCard[] }) {
  if (cards.length === 0) {
    return (
      <div className="border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No engagements yet. Record one below once a job is done — reviews unlock only after both
          sides confirm the rate and duration.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border border border-border">
      {cards.map((card) => (
        <OneEngagement key={card.engagement.id} card={card} />
      ))}
    </ul>
  );
}

export { TermsFields };
