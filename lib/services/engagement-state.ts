/**
 * Pure engagement state. No I/O, so the whole "reviews are locked until both
 * parties confirm" matrix is unit-testable without a database.
 *
 * The row carries two independent booleans rather than a status column, so
 * "what state is this in" is a derivation, and every caller must derive it the
 * same way. That is what lives here.
 */

export type EngagementSide = "FREELANCER" | "RECRUITER";

export type EngagementConfirmationRow = {
  freelancerConfirmed: boolean;
  recruiterConfirmed: boolean;
  declinedAt: Date | null;
};

export type EngagementState =
  /** One side asserted it; the other has not answered. */
  | "PENDING"
  /** Both sides confirmed. Reviews are unlocked. Terminal. */
  | "CONFIRMED"
  /** The other side refused the claim. Terminal. */
  | "DECLINED"
  /**
   * Neither side has confirmed. No path in the service produces this — the
   * proposer is always confirmed on creation — but the columns permit it, so
   * it is named rather than silently folded into PENDING.
   */
  | "UNCLAIMED";

export function engagementState(row: EngagementConfirmationRow): EngagementState {
  if (row.freelancerConfirmed && row.recruiterConfirmed) return "CONFIRMED";
  // Checked after CONFIRMED so a row that somehow holds both cannot present as
  // declined. The database CHECK makes that combination impossible; if it ever
  // appears, confirmed is the safer reading — it is the one that is provable
  // from two affirmative acts rather than from one absence.
  if (row.declinedAt) return "DECLINED";
  if (row.freelancerConfirmed || row.recruiterConfirmed) return "PENDING";
  return "UNCLAIMED";
}

/** True only when BOTH parties have confirmed. The gate for every review. */
export function reviewsUnlocked(row: EngagementConfirmationRow): boolean {
  return engagementState(row) === "CONFIRMED";
}

export const opposite = (side: EngagementSide): EngagementSide =>
  side === "FREELANCER" ? "RECRUITER" : "FREELANCER";

export const hasConfirmed = (row: EngagementConfirmationRow, side: EngagementSide): boolean =>
  side === "FREELANCER" ? row.freelancerConfirmed : row.recruiterConfirmed;

/** The side that proposed: the one already confirmed while still pending. */
export function proposingSide(row: EngagementConfirmationRow): EngagementSide | null {
  if (engagementState(row) !== "PENDING") return null;
  return row.freelancerConfirmed ? "FREELANCER" : "RECRUITER";
}

/**
 * Who is waiting on whom. Only the side that did NOT propose may confirm or
 * decline — otherwise the proposer could confirm their own claim twice and
 * unlock reviews alone, which is the entire rule this feature exists to hold.
 */
export function canRespond(row: EngagementConfirmationRow, side: EngagementSide): boolean {
  return engagementState(row) === "PENDING" && !hasConfirmed(row, side);
}

/** The proposer may fix the terms, but only while the other side is undecided. */
export function canAmendTerms(row: EngagementConfirmationRow, side: EngagementSide): boolean {
  return engagementState(row) === "PENDING" && hasConfirmed(row, side);
}

/** A party may write exactly one review, once confirmed and not before. */
export function canWriteReview(
  row: EngagementConfirmationRow,
  side: EngagementSide,
  alreadyWritten: boolean,
): boolean {
  return reviewsUnlocked(row) && !alreadyWritten;
}
