import {
  addPortfolioItemTx,
  deletePortfolioItem,
  getOwnedPortfolioItem,
  listPortfolio,
  reorderPortfolio,
  type PortfolioRow,
} from "@/lib/db/portfolio";
import { getFreelancerProfileByUserId } from "@/lib/db/users";
import {
  deletePortfolioImages,
  uploadPortfolioImage,
  validatePortfolioImage,
} from "@/lib/storage/portfolio-images";
import { PORTFOLIO_MAX_ITEMS, type PortfolioItemInput } from "@/lib/validations/portfolio";

import { scanProfileProse, type ProfileProseFlag } from "./profile-safety";

/**
 * Portfolio business logic.
 *
 * Every item is looked up by the CALLER'S profile, resolved from their own
 * user id — there is no freelancerId parameter to forge, so editing someone
 * else's portfolio is unrepresentable rather than refused.
 *
 * Title and description are public, indexed prose and go through the same
 * scanner every other public field does. Skipping it would have reopened at a
 * fourth door the hole that profile-safety.ts was written to close: "pay a
 * $200 setup fee" reads the same in a portfolio caption as in a bio.
 *
 * Free for every freelancer, on purpose. Portfolios are supply-side quality —
 * gating the thing that makes profiles worth browsing costs the marketplace
 * more than it earns, and an empty directory is not a compelling upsell.
 */

export type PortfolioResult =
  | { ok: true }
  | { ok: false; reason: "no-profile" | "cap-reached" | "invalid-image" | "not-found" | "failed" }
  | { ok: false; reason: "flagged"; flag: ProfileProseFlag };

export type PortfolioView =
  | { ok: true; items: PortfolioRow[]; remaining: number; max: number }
  | { ok: false; reason: "no-profile" };

export async function getPortfolioForUser(userId: string): Promise<PortfolioView> {
  const profile = await getFreelancerProfileByUserId(userId);
  if (!profile) return { ok: false, reason: "no-profile" };

  const items = await listPortfolio(profile.id);
  return {
    ok: true,
    items,
    remaining: Math.max(0, PORTFOLIO_MAX_ITEMS - items.length),
    max: PORTFOLIO_MAX_ITEMS,
  };
}

export async function addPortfolioItemForUser(
  userId: string,
  input: PortfolioItemInput,
  image: unknown,
): Promise<PortfolioResult> {
  const profile = await getFreelancerProfileByUserId(userId);
  if (!profile) return { ok: false, reason: "no-profile" };

  // Prose first, before anything is uploaded: a refused item should not leave
  // an orphaned object in a public bucket.
  const flag = scanProfileProse([
    { field: "description", text: input.description },
    { field: "title", text: input.title },
  ]);
  if (flag) return { ok: false, reason: "flagged", flag };

  const validated = validatePortfolioImage(image);
  if (!validated.ok) return { ok: false, reason: "invalid-image" };

  const uploaded = await uploadPortfolioImage(userId, validated.file);
  if (!uploaded.ok) return { ok: false, reason: "failed" };

  const added = await addPortfolioItemTx({
    freelancerId: profile.id,
    title: input.title,
    description: input.description,
    imageUrl: uploaded.url,
    linkUrl: input.linkUrl,
  });

  if (!added.ok) {
    // The cap was reached between the upload and the insert. Take the object
    // back out rather than leaving a file nothing points at.
    await deletePortfolioImages([uploaded.url]);
    return { ok: false, reason: "cap-reached" };
  }

  return { ok: true };
}

export async function removePortfolioItemForUser(
  userId: string,
  itemId: string,
): Promise<PortfolioResult> {
  const profile = await getFreelancerProfileByUserId(userId);
  if (!profile) return { ok: false, reason: "no-profile" };

  // Read first, for the image URL — the row is gone after the delete.
  const item = await getOwnedPortfolioItem(profile.id, itemId);
  if (!item) return { ok: false, reason: "not-found" };

  const deleted = await deletePortfolioItem(profile.id, itemId);
  if (!deleted) return { ok: false, reason: "not-found" };

  // Best effort, after the row is gone. A leftover object costs storage; a
  // failed request here would leave the item on the page after the person
  // deleted it, which is the worse outcome.
  await deletePortfolioImages([item.imageUrl]);
  return { ok: true };
}

export async function reorderPortfolioForUser(
  userId: string,
  ids: readonly string[],
): Promise<PortfolioResult> {
  const profile = await getFreelancerProfileByUserId(userId);
  if (!profile) return { ok: false, reason: "no-profile" };

  const moved = await reorderPortfolio(profile.id, ids);
  // Nothing matched: every id belonged to someone else, or to nothing.
  if (moved === 0) return { ok: false, reason: "not-found" };
  return { ok: true };
}
