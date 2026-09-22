"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/services/rate-limit";
import {
  addPortfolioItemForUser,
  getPortfolioForUser,
  removePortfolioItemForUser,
  reorderPortfolioForUser,
} from "@/lib/services/portfolio";
import { safetyReasonPhrase } from "@/lib/services/profile-safety";
import { portfolioItemSchema } from "@/lib/validations/portfolio";

export type PortfolioFormState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
};

const PAGE = "/dashboard/freelancer/portfolio";

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

/**
 * Server Action to add a portfolio item.
 *
 * Auth and rate limits are checked before parsing, ensuring unauthenticated or
 * abusive callers are turned away at the boundary.
 */
export async function addPortfolioItemAction(
  _prev: PortfolioFormState,
  formData: FormData,
): Promise<PortfolioFormState> {
  const { user } = await requireRole("FREELANCER");

  const rateLimit = await checkRateLimit("profile-write", user.id);
  if (!rateLimit.allowed) redirect(`${PAGE}?notice=too_fast`);

  const rawTitle = str(formData, "title");
  const rawDescription = str(formData, "description");
  const rawLinkUrl = str(formData, "linkUrl");
  const image = formData.get("image");

  if (!image || !(image instanceof File) || image.size === 0) {
    return {
      fieldErrors: { image: "Select a cover image for this work item." },
      formError: null,
    };
  }

  const parsed = portfolioItemSchema.safeParse({
    title: rawTitle,
    description: rawDescription || null,
    linkUrl: rawLinkUrl || null,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, formError: "Please fix the highlighted fields." };
  }

  const result = await addPortfolioItemForUser(user.id, parsed.data, image);

  if (result.ok) {
    redirect(`${PAGE}?notice=item_added`);
  }

  if (result.reason === "flagged") {
    return {
      fieldErrors: {
        [result.flag.field]: `This reads as ${safetyReasonPhrase(result.flag.match.reason)} ("${result.flag.match.matchedTerm}"), which a public portfolio item cannot contain. Please reword it.`,
      },
      formError: "Prose flagged by safety scanner.",
    };
  }

  if (result.reason === "invalid-image") {
    return {
      fieldErrors: {
        image: "Upload a valid PNG, JPEG, or WebP image under 5 MB.",
      },
      formError: null,
    };
  }

  if (result.reason === "cap-reached") {
    return {
      fieldErrors: {},
      formError: "You have reached the maximum portfolio limit of 12 items.",
    };
  }

  if (result.reason === "no-profile") {
    redirect("/onboarding/freelancer");
  }

  return {
    fieldErrors: {},
    formError: "Failed to upload or save this item. Please try again.",
  };
}

/**
 * Server Action to delete a portfolio item.
 */
export async function deletePortfolioItemAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("FREELANCER");

  const rateLimit = await checkRateLimit("profile-write", user.id);
  if (!rateLimit.allowed) redirect(`${PAGE}?notice=too_fast`);

  const itemId = str(formData, "itemId");
  if (!itemId) redirect(`${PAGE}?notice=not_found`);

  const result = await removePortfolioItemForUser(user.id, itemId);
  if (!result.ok) {
    redirect(`${PAGE}?notice=${result.reason === "not-found" ? "not_found" : "failed"}`);
  }

  redirect(`${PAGE}?notice=item_deleted`);
}

/**
 * Server Action to move a portfolio item up or down.
 */
export async function movePortfolioItemAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("FREELANCER");

  const rateLimit = await checkRateLimit("profile-write", user.id);
  if (!rateLimit.allowed) redirect(`${PAGE}?notice=too_fast`);

  const itemId = str(formData, "itemId");
  const direction = str(formData, "direction");

  if (!itemId || (direction !== "up" && direction !== "down")) {
    redirect(`${PAGE}?notice=failed`);
  }

  const current = await getPortfolioForUser(user.id);
  if (!current.ok) {
    redirect(`${PAGE}?notice=failed`);
  }

  const items = current.items;
  const index = items.findIndex((i) => i.id === itemId);
  if (index === -1) {
    redirect(`${PAGE}?notice=not_found`);
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    // Already at the boundary, nothing to swap
    redirect(PAGE);
  }

  const newIds = items.map((i) => i.id);
  const temp = newIds[index];
  newIds[index] = newIds[targetIndex];
  newIds[targetIndex] = temp;

  const result = await reorderPortfolioForUser(user.id, newIds);
  if (!result.ok) {
    redirect(`${PAGE}?notice=failed`);
  }

  redirect(`${PAGE}?notice=reordered`);
}
