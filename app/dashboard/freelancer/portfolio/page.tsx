import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  IconArrowDown,
  IconArrowUp,
  IconExternal,
  IconImage,
  IconTrash,
} from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { requireRole } from "@/lib/auth/guards";
import { getFreelancerProfileByUserId } from "@/lib/db/users";
import { getPortfolioForUser } from "@/lib/services/portfolio";

import {
  deletePortfolioItemAction,
  movePortfolioItemAction,
} from "./actions";
import { resolvePortfolioNotice } from "./notices";
import { PortfolioForm } from "./portfolio-form";

export const metadata = { title: "Portfolio — Talent4u" };

export default async function FreelancerPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { user } = await requireRole("FREELANCER");

  const [portfolioResult, profile, params] = await Promise.all([
    getPortfolioForUser(user.id),
    getFreelancerProfileByUserId(user.id),
    searchParams,
  ]);

  if (!portfolioResult.ok || !profile) {
    redirect("/onboarding/freelancer");
  }

  const notice = resolvePortfolioNotice(params.notice);
  const items = portfolioResult.items;
  const count = items.length;
  const max = portfolioResult.max;

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-4xl px-6 py-8 lg:px-8 space-y-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/70">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="t-heading text-2xl font-bold">Portfolio</h1>
              <span className="t-label inline-flex items-center px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                {count} of {max} used
              </span>
            </div>
            <p className="mt-1 text-[15px] leading-[22px] text-muted-foreground">
              Add visual proofs of work, case studies, and live links. Shown prominently on your{" "}
              <Link
                href={`/freelancers/${profile.slug}`}
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary transition-colors"
              >
                public profile
              </Link>{" "}
              and the freelancer directory.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/dashboard/freelancer/profile">Edit profile</Link>}
            />
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/freelancers/${profile.slug}`}>View profile</Link>}
            />
          </div>
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="w-full">
            {notice.message}
          </Notice>
        ) : null}

        {/* Add Form Section */}
        <section>
          <PortfolioForm remaining={portfolioResult.remaining} />
        </section>

        {/* Current Items List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="t-subhead">Current items ({count})</h2>
            {count > 1 ? (
              <p className="text-[13px] text-muted-foreground">
                First item serves as your directory showcase cover
              </p>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="surface-card p-12 text-center border border-dashed border-border/80">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/80 text-muted-foreground mb-4">
                <IconImage className="size-6" />
              </div>
              <h3 className="t-subhead">No portfolio items yet</h3>
              <p className="mt-1 text-[14px] text-muted-foreground max-w-md mx-auto">
                Profiles with visual portfolio items get up to 3x more recruiter inquiries and direct message requests.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, index) => {
                const isFirst = index === 0;
                const isLast = index === items.length - 1;

                return (
                  <article
                    key={item.id}
                    className="surface-card p-5 sm:p-6 flex flex-col md:flex-row gap-6 items-start justify-between border border-border/50 hover:border-border transition-all duration-200"
                  >
                    {/* Cover thumbnail */}
                    <div className="relative aspect-[16/10] w-full md:w-56 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-muted/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                      {isFirst ? (
                        <span className="absolute top-2 left-2 rounded-md bg-foreground/90 backdrop-blur-sm px-2 py-0.5 text-[11px] font-semibold text-background tracking-wide">
                          COVER
                        </span>
                      ) : null}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <h3 className="t-subhead text-[17px] font-semibold">{item.title}</h3>
                        {item.linkUrl ? (
                          <a
                            href={item.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
                          >
                            <span>Live link</span>
                            <IconExternal className="size-3.5" />
                          </a>
                        ) : null}
                      </div>

                      {item.description ? (
                        <p className="text-[14px] leading-[22px] text-muted-foreground whitespace-pre-line line-clamp-3">
                          {item.description}
                        </p>
                      ) : null}
                    </div>

                    {/* Controls: Reorder + Delete */}
                    <div className="flex md:flex-col items-center justify-end gap-2 shrink-0 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-border/60">
                      <div className="flex items-center gap-1">
                        <form action={movePortfolioItemAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="direction" value="up" />
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            disabled={isFirst}
                            aria-label="Move item up"
                            title="Move item up"
                            className="px-2"
                          >
                            <IconArrowUp className="size-4" />
                          </Button>
                        </form>

                        <form action={movePortfolioItemAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="direction" value="down" />
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            disabled={isLast}
                            aria-label="Move item down"
                            title="Move item down"
                            className="px-2"
                          >
                            <IconArrowDown className="size-4" />
                          </Button>
                        </form>
                      </div>

                      <form action={deletePortfolioItemAction}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          aria-label="Delete item"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2.5"
                        >
                          <IconTrash className="size-4 mr-1.5" />
                          <span>Delete</span>
                        </Button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
