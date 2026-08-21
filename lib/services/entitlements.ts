import { getSession } from "@/lib/auth/session";
import { getEntitlementContext } from "@/lib/db/users";
import { bandForCountry, DEFAULT_BAND, type PriceBand } from "@/lib/pricing/bands";
import { getEntitlements, type Entitlements } from "@/lib/pricing/entitlements";

/**
 * The I/O half of entitlements: load an account, hand it to the pure config in
 * lib/pricing, return what it may do and what it pays.
 *
 * Kept out of lib/pricing deliberately — that directory is the price and
 * capability CONFIG and stays free of database access, so the whole matrix
 * remains unit-testable without a connection.
 */

export type ViewerEntitlements = {
  entitlements: Entitlements;
  /** Which purchasing-power band this viewer's prices come from. */
  band: PriceBand;
  /** Null when logged out or the country was never set. */
  billingCountry: string | null;
};

/** The logged-out visitor: browsing is free, everything paid is off. */
export const VISITOR: ViewerEntitlements = {
  entitlements: getEntitlements({ role: null, plan: "FREE" }),
  band: DEFAULT_BAND,
  billingCountry: null,
};

export async function getEntitlementsForUser(userId: string): Promise<ViewerEntitlements> {
  const context = await getEntitlementContext(userId);
  if (!context) return VISITOR;

  return {
    entitlements: getEntitlements({
      role: context.role,
      plan: context.plan,
      recruiterTier: context.recruiterTier,
    }),
    band: bandForCountry(context.billingCountry),
    billingCountry: context.billingCountry,
  };
}

/**
 * The current viewer's entitlements, session and all. Returns VISITOR for
 * anyone logged out rather than throwing, because the pages that price things
 * are public.
 */
export async function getViewerEntitlements(): Promise<ViewerEntitlements> {
  const session = await getSession();
  if (!session) return VISITOR;
  return getEntitlementsForUser(session.userId);
}

/**
 * The price band alone, for surfaces that need to quote a price but not gate
 * anything. Cheaper to read than the whole object at a call site that only
 * renders "$6/mo".
 */
export async function getViewerBand(): Promise<PriceBand> {
  const { band } = await getViewerEntitlements();
  return band;
}
