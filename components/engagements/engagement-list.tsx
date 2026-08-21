import Link from "next/link";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { StarRating } from "@/components/profile/star-rating";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { timeAgo } from "@/lib/format/time";
import { engagementStateBadge, recruiterTierBadge } from "@/lib/profile/badges";
import type { EngagementCard } from "@/lib/services/engagement";
import { cn } from "@/lib/utils";
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
 *
 * The screen has one job beyond listing rows: teach mutual confirmation at the
 * point of use. Nobody arrives already knowing why a stranger is asking them to
 * agree to a rate, so every row that needs an answer states what confirming
 * does, what declining costs, and that declining cannot be taken back — all of
 * it BEFORE the two buttons, never after.
 */

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** The anchor the empty state jumps to — the record form lives further down. */
export const RECORD_ANCHOR = "record-engagement";

const focusRing =
  "rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// ── Terms ──────────────────────────────────────────────────────────────────

/**
 * The three figures the whole mechanic turns on, as data rather than prose.
 * Fixed-width cells so rate, duration and date line up down the page.
 */
function TermsSummary({ card }: { card: EngagementCard }) {
  const { engagement, state } = card;
  const { statedRateUsd, durationWeeks } = engagement;

  const timeline =
    state === "CONFIRMED" && engagement.confirmedAt
      ? { label: "Confirmed", value: dateFmt.format(engagement.confirmedAt) }
      : state === "DECLINED" && engagement.declinedAt
        ? { label: "Declined", value: dateFmt.format(engagement.declinedAt) }
        : { label: "Filed", value: timeAgo(engagement.createdAt) };

  return (
    <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-3">
      <div className="min-w-28">
        <dt className="t-label text-muted-foreground">Stated rate</dt>
        <dd className={cn("t-data mt-1", statedRateUsd === null && "text-muted-foreground")}>
          {statedRateUsd === null ? "Not stated" : formatStatedRate(statedRateUsd)}
        </dd>
      </div>
      <div className="min-w-28">
        <dt className="t-label text-muted-foreground">Duration</dt>
        <dd className={cn("t-data mt-1", durationWeeks === null && "text-muted-foreground")}>
          {durationWeeks === null ? "Not stated" : formatDuration(durationWeeks)}
        </dd>
      </div>
      <div className="min-w-28">
        <dt className="t-label text-muted-foreground">{timeline.label}</dt>
        <dd className="t-data mt-1">{timeline.value}</dd>
      </div>
    </dl>
  );
}

/**
 * The rate and duration inputs, shared by the record form and the amend form.
 * `idPrefix` keeps the label/control association unique when several of these
 * render on one page — one per amendable row, plus the record form.
 */
function TermsFields({
  idPrefix,
  defaultRate,
  defaultWeeks,
  className,
}: {
  idPrefix: string;
  defaultRate?: number | null;
  defaultWeeks?: number | null;
  className?: string;
}) {
  const rateId = `${idPrefix}-rate`;
  const weeksId = `${idPrefix}-weeks`;
  const rateHint = "Whole US dollars, the figure you both agreed.";
  const weeksHint = "Whole weeks, start to finish.";

  return (
    <div className={cn("flex flex-wrap gap-x-6 gap-y-4", className)}>
      <Field label="Agreed rate (USD)" htmlFor={rateId} hint={rateHint} required className="w-44">
        <Input
          {...fieldControlProps(rateId, { hint: rateHint })}
          name="statedRateUsd"
          type="number"
          min={1}
          max={100000}
          step={1}
          required
          defaultValue={defaultRate ?? undefined}
        />
      </Field>
      <Field label="Duration (weeks)" htmlFor={weeksId} hint={weeksHint} required className="w-44">
        <Input
          {...fieldControlProps(weeksId, { hint: weeksHint })}
          name="durationWeeks"
          type="number"
          min={1}
          max={520}
          step={1}
          required
          defaultValue={defaultWeeks ?? undefined}
        />
      </Field>
    </div>
  );
}

// ── Rating input ───────────────────────────────────────────────────────────

const RATING_VALUES = [1, 2, 3, 4, 5];

const ratingName = (value: number): string =>
  `${value} ${value === 1 ? "star" : "stars"} — ${RATING_LABELS[value]}`;

/** One star on the 24px icon grid: 1.5px stroke, square caps, currentColor. */
function StarGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-6 fill-none stroke-current"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M12 3 14.3 8.8 20.6 9.2 15.7 13.2 17.3 19.3 12 15.9 6.7 19.3 8.3 13.2 3.4 9.2 9.7 8.8Z" />
    </svg>
  );
}

/**
 * A real radio group, styled as a star rating.
 *
 * Five native radios inside a fieldset — nothing here is a div pretending to be
 * a control, so keyboard, form semantics and the required constraint are the
 * platform's. Each star is a 44px target, and the fill runs left to right
 * without JavaScript: `:has()` fills the checked label and every label that has
 * a checked one after it, which is exactly "every star up to the choice".
 */
function RatingInput() {
  return (
    <fieldset>
      <legend className="t-label text-muted-foreground">Rating</legend>
      <div
        className={cn(
          "mt-1 flex",
          "[&>label:has(input:checked)]:text-foreground",
          "[&>label:has(input:checked)_svg]:fill-current",
          "[&>label:has(~label_input:checked)]:text-foreground",
          "[&>label:has(~label_input:checked)_svg]:fill-current",
        )}
      >
        {RATING_VALUES.map((value) => (
          <label
            key={value}
            title={ratingName(value)}
            className={cn(
              "inline-flex size-11 cursor-pointer items-center justify-center",
              "text-muted-foreground transition-colors duration-[120ms] ease-out",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
            )}
          >
            <input type="radio" name="rating" value={value} required className="sr-only" />
            <span className="sr-only">{ratingName(value)}</span>
            <StarGlyph />
          </label>
        ))}
      </div>
      <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
        1 = would not work with again. 5 = excellent.
      </p>
    </fieldset>
  );
}

// ── Reviews ────────────────────────────────────────────────────────────────

function ReviewForm({ card }: { card: EngagementCard }) {
  const subject =
    card.side === "FREELANCER"
      ? card.engagement.recruiter.companyName
      : card.engagement.freelancer.displayName;
  const bodyId = `review-body-${card.engagement.id}`;
  const bodyHint = "At least 40 characters. Specifics help the next reader more than praise.";

  return (
    <form action={writeReview} className="mt-4 border-t border-border pt-4">
      <input type="hidden" name="engagementId" value={card.engagement.id} />
      <p className="t-label text-muted-foreground">Review {subject}</p>
      <p className="measure mt-2 text-[15px] leading-[22px] text-muted-foreground">
        You both confirmed the same rate and duration, so reviews are open. Yours publishes on{" "}
        {subject}&apos;s profile under your name, and you cannot edit it afterwards.
      </p>

      <div className="mt-3">
        <RatingInput />
      </div>

      <Field
        label="What was it like to work together?"
        htmlFor={bodyId}
        hint={bodyHint}
        required
        className="mt-4 max-w-2xl"
      >
        <Textarea
          {...fieldControlProps(bodyId, { hint: bodyHint })}
          name="body"
          rows={4}
          minLength={40}
          maxLength={2000}
          required
          placeholder="What did they do, how did it go, and what would you tell the next person deciding?"
        />
      </Field>

      <Button type="submit" size="sm" className="mt-4">
        Publish review
      </Button>
    </form>
  );
}

function WrittenReview({
  heading,
  review,
}: {
  heading: string;
  review: NonNullable<EngagementCard["ownReview"]>;
}) {
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="t-label text-muted-foreground">{heading}</p>
      <div className="mt-1">
        <StarRating value={review.rating} count={1} hideCount />
      </div>
      <p className="measure mt-1 whitespace-pre-wrap text-[15px] leading-[22px]">{review.body}</p>
    </div>
  );
}

// ── Responding ─────────────────────────────────────────────────────────────

/**
 * The claim the other side filed, and the two answers to it.
 *
 * Confirming is the primary action; declining is an outline beside it. The
 * paragraph above them carries the whole consequence — declining is terminal,
 * because the unique constraint that stops a refused claim being re-filed holds
 * the declined row in place forever. That is stated before the buttons, where a
 * person can still act on it.
 */
function RespondBlock({ card }: { card: EngagementCard }) {
  const { engagement } = card;
  const counterparty =
    card.side === "FREELANCER"
      ? engagement.recruiter.companyName
      : engagement.freelancer.displayName;

  const rate = engagement.statedRateUsd;
  const weeks = engagement.durationWeeks;
  const canConfirm = card.canConfirm && rate !== null && weeks !== null;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="t-label text-muted-foreground">Waiting on you</p>

      <div className="measure mt-2 space-y-2 text-[15px] leading-[22px] text-muted-foreground">
        {card.counterpartyRemoved ? (
          <p>
            {counterparty} has been removed from Talent4u, so there is nothing here left to
            confirm. Declining clears it off your dashboard.
          </p>
        ) : canConfirm ? (
          <>
            <p>
              {counterparty} says the two of you worked together at{" "}
              <span className="t-data text-foreground">{formatStatedRate(rate)}</span> for{" "}
              <span className="t-data text-foreground">{formatDuration(weeks)}</span>. Confirm only
              if both figures match what actually happened.
            </p>
            <p>
              Confirming is what opens reviews: until both of you agree to the same rate and
              duration, neither of you can review the other and none of this is public.
              {card.side === "FREELANCER"
                ? ` It also counts toward ${counterparty}'s Trusted badge.`
                : null}
            </p>
          </>
        ) : (
          <p>
            This claim is missing the rate, the duration, or both, so there is nothing specific to
            confirm. Ask {counterparty} to state both figures, or decline it.
          </p>
        )}

        <p>Declining is permanent — neither of you can file this claim again.</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canConfirm ? (
          <form action={confirmEngagement}>
            <input type="hidden" name="engagementId" value={engagement.id} />
            {/* The figures on screen travel with the click. If the other
                side amends them in the meantime, the server refuses rather
                than recording agreement to numbers never displayed here. */}
            <input type="hidden" name="seenRateUsd" value={engagement.statedRateUsd ?? ""} />
            <input type="hidden" name="seenDurationWeeks" value={engagement.durationWeeks ?? ""} />
            {/* Ink, not red: several rows can await an answer at once, and
                the accent has to stay meaningful across the whole view. */}
            <Button type="submit" size="sm" variant="secondary">
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
    </div>
  );
}

/** The proposer's side of a pending claim: what is missing, and how to fix it. */
function AwaitingThemBlock({ card }: { card: EngagementCard }) {
  const { engagement } = card;
  const counterparty =
    card.side === "FREELANCER"
      ? engagement.recruiter.companyName
      : engagement.freelancer.displayName;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="t-label text-muted-foreground">Waiting on them</p>
      {card.counterpartyRemoved ? (
        <p className="measure mt-2 text-[15px] leading-[22px] text-muted-foreground">
          You have confirmed these figures, but {counterparty} has been removed from Talent4u and
          can no longer answer. This stays as a record and will not unlock reviews.
        </p>
      ) : (
        <p className="measure mt-2 text-[15px] leading-[22px] text-muted-foreground">
          You have confirmed these figures. {counterparty} has not answered yet, and one side alone
          counts for nothing — nothing is public and no review can be written until they confirm the
          same rate and duration.
        </p>
      )}

      {card.canAmend ? (
        <details className="mt-1">
          <summary
            className={cn(
              "t-label min-h-11 cursor-pointer py-3.5 text-muted-foreground hover:text-foreground",
              focusRing,
            )}
          >
            Correct the figures
          </summary>
          <form action={amendEngagementTerms}>
            <input type="hidden" name="engagementId" value={engagement.id} />
            <TermsFields
              idPrefix={`amend-${engagement.id}`}
              defaultRate={engagement.statedRateUsd}
              defaultWeeks={engagement.durationWeeks}
            />
            <p className="measure mt-3 text-[15px] leading-[22px] text-muted-foreground">
              New figures replace what {counterparty} sees, and anything they confirm afterwards is
              the new pair.
            </p>
            <Button type="submit" size="sm" variant="outline" className="mt-3">
              Update terms
            </Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

// ── One row ────────────────────────────────────────────────────────────────

function OneEngagement({ card }: { card: EngagementCard }) {
  const { engagement, state } = card;
  const isFreelancerView = card.side === "FREELANCER";
  const counterpartyName = isFreelancerView
    ? engagement.recruiter.companyName
    : engagement.freelancer.displayName;
  // A removed employer's public page is gone, and their old tier is not a
  // recommendation we still stand behind — so neither is shown.
  const href = isFreelancerView
    ? `/companies/${engagement.recruiter.slug}`
    : `/freelancers/${engagement.freelancer.slug}`;
  const linked = !(isFreelancerView && card.counterpartyRemoved);

  return (
    <li className="row-hover px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="min-w-0 text-[15px] font-semibold leading-[22px]">
          {linked ? (
            <Link href={href} className={cn("hover:underline", focusRing)}>
              {counterpartyName}
            </Link>
          ) : (
            counterpartyName
          )}
        </h3>
        <ProfileBadge spec={engagementStateBadge(state)} />
        {isFreelancerView ? (
          card.counterpartyRemoved ? (
            <ProfileBadge
              spec={{
                label: "Removed",
                tone: "red",
                title: "This employer was removed from Talent4u. See the public removals page.",
              }}
            />
          ) : (
            <ProfileBadge spec={recruiterTierBadge(engagement.recruiter.tier)} />
          )
        ) : null}
      </div>

      {engagement.job ? (
        <p className="mt-1 text-[15px] leading-[22px] text-muted-foreground">
          {engagement.job.title}
        </p>
      ) : null}

      <TermsSummary card={card} />

      {card.canRespond ? <RespondBlock card={card} /> : null}
      {state === "PENDING" && !card.canRespond ? <AwaitingThemBlock card={card} /> : null}
      {state === "DECLINED" ? (
        <p className="measure mt-3 text-[15px] leading-[22px] text-muted-foreground">
          One side said this is not an engagement they had, so it counts for nothing and no review
          can be written. It stays on the record and cannot be filed again.
        </p>
      ) : null}

      {card.ownReview ? <WrittenReview heading="Your review" review={card.ownReview} /> : null}
      {card.canReview ? <ReviewForm card={card} /> : null}
      {card.receivedReview ? (
        <WrittenReview heading="Their review of you" review={card.receivedReview} />
      ) : null}
    </li>
  );
}

export function EngagementList({ cards }: { cards: EngagementCard[] }) {
  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="t-label text-muted-foreground">Your engagements</h2>
        <p className="flex items-baseline gap-1.5">
          <span className="t-data">{cards.length}</span>
          <span className="t-label text-muted-foreground">on record</span>
        </p>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title="No engagements yet"
          guidance="Record one against a job you and the other side already share, stating the rate and the number of weeks. Reviews open only once both of you confirm those same two figures."
          action={<Button render={<a href={`#${RECORD_ANCHOR}`}>Record engagement</a>} />}
        />
      ) : (
        /* Rows sharing one hairline, not cards floating with gaps. */
        <ul className="rowset">
          {cards.map((card) => (
            <OneEngagement key={card.engagement.id} card={card} />
          ))}
        </ul>
      )}
    </>
  );
}

export { TermsFields };
