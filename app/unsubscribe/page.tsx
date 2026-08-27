import type { Metadata } from "next";
import Link from "next/link";

import { PublicChrome } from "@/components/shell/public-chrome";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { unsubscribeByToken } from "@/lib/db/digest";

import { resubscribe } from "./actions";

export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

/**
 * One click to stop the weekly digest, from the mail itself.
 *
 * Acts on the GET rather than showing a confirm button, because the footer
 * promises one click and because a two-step unsubscribe is how people end up
 * marking mail as spam instead. The cost of that choice is real: mail security
 * scanners and link previewers fetch every URL in a message before a human
 * sees it, so somebody who never clicked can land here already unsubscribed.
 *
 * Which is why the page's main affordance is putting it back. One click each
 * way, no sign-in either way, and nothing else about the account changes —
 * mail about your own applications is transactional and is not affected.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; state?: string }>;
}) {
  const { token, state } = await searchParams;

  // Coming back from the resubscribe action, which has already done the work.
  const resubscribed = state === "resubscribed";
  const invalid = state === "invalid";

  const result = resubscribed || invalid ? null : token ? await unsubscribeByToken(token) : null;
  const done = Boolean(result);

  return (
    <PublicChrome>
      <main id="main" className="flex-1">
        <div className="mx-auto w-full max-w-[var(--container-marketing)] px-6 py-16">
          <div className="w-full max-w-xl">
            <h1 className="t-display-2">Email preferences</h1>

            {resubscribed ? (
              <>
                <Notice tone="success" className="mt-6">
                  The weekly digest is back on.
                </Notice>
                <p className="mt-5 text-[16px] leading-[26px] text-muted-foreground">
                  You will get one email a week listing new jobs that match the skills on your
                  profile, and nothing else.
                </p>
              </>
            ) : done ? (
              <>
                <Notice tone="success" className="mt-6">
                  Done — no more weekly job digests.
                </Notice>
                <p className="measure mt-5 text-[16px] leading-[26px] text-muted-foreground">
                  Nothing else changes. You will still hear from us about your own applications,
                  messages and account, because those are about something you did.
                </p>

                {/* The undo. Mail scanners open every link in a message before
                    a person sees it, so somebody may be reading this without
                    ever having clicked. */}
                {token ? (
                  <form action={resubscribe} className="mt-7">
                    <input type="hidden" name="token" value={token} />
                    <Button type="submit" variant="outline">
                      I did not mean to — turn it back on
                    </Button>
                  </form>
                ) : null}
              </>
            ) : (
              <>
                <Notice tone="error" className="mt-6">
                  That link has expired or was not one of ours.
                </Notice>
                <p className="measure mt-5 text-[16px] leading-[26px] text-muted-foreground">
                  You can change every email setting from your account instead — the digest toggle
                  lives in settings.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Button render={<Link href="/dashboard/settings">Open settings</Link>} />
                  <Button variant="ghost" render={<Link href="/">Back to Talent4u</Link>} />
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </PublicChrome>
  );
}
