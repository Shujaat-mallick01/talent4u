import { Logo } from "@/components/shell/logo";
import { getProof } from "@/lib/marketing/proof";

/**
 * The frame every auth screen sits in.
 *
 * Left: the form, capped at a readable width and left-aligned rather than
 * floated in the centre of an empty page.
 *
 * Right: a ruled data panel — the orbit at real scale, and the product's
 * argument as tabular numbers. This is the one place a person decides whether
 * to trust us with an email address, and the honest answer to "why should I"
 * is a set of facts, not a headline. The panel is also where the brand's only
 * owned shape finally appears above favicon size.
 *
 * The panel is hidden below the split, not stacked: on a phone the form is the
 * whole job, and a marketing block above it would push the first field under
 * the fold.
 */
export async function AuthLayout({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const proof = await getProof();

  return (
    <main id="main" className="flex-1">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col items-center justify-center px-6 py-12 lg:items-end lg:py-24 lg:pr-16">
          <div className="surface-card w-full max-w-[550px] p-8 sm:p-10">
            <h1 className="t-display-2">{title}</h1>
            {intro ? (
              <div className="mt-3 text-[15px] leading-[22px] text-muted-foreground">{intro}</div>
            ) : null}
            <div className="mt-8">{children}</div>
            {footer ? (
              <div className="mt-8 border-t border-border pt-5 text-[15px] text-muted-foreground">
                {footer}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="hidden border-l border-border bg-card lg:flex lg:flex-col lg:justify-between lg:py-24 lg:pr-6 lg:pl-16">
          <div className="max-w-[460px]">
            {/* The lockup, not the orbit on its own: two arcs of red dots
                with nothing between them read as a spinner mid-rotation, and
                a login page that looks like it is still loading is not the
                first impression to spend the brand mark on. */}
            <Logo className="w-[184px]" />
            <p className="t-heading mt-8 measure">
              We never touch the money, so we never take a cut of it.
            </p>
            <p className="mt-3 measure text-[15px] leading-[22px] text-muted-foreground">
              Companies pay a flat subscription. Freelancers keep everything they earn. You and the
              company agree terms and pay each other directly — we are not in the middle of it.
            </p>
          </div>

          <dl className="mt-12 max-w-[460px] border-t border-border">
            {proof.points.map((point) => (
              <div
                key={point.label}
                className="flex items-baseline justify-between gap-4 border-b border-border py-3"
              >
                <dt className="t-label text-muted-foreground">{point.label}</dt>
                <dd className="t-data">{point.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </main>
  );
}

/**
 * The divider between a password form and an OAuth button. A rule with the
 * word set into it, rather than a floating "or" that reads as a stray label.
 */
export function AuthDivider({ children = "or" }: { children?: React.ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="t-label text-muted-foreground">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
