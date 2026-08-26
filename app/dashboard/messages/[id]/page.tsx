import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { IconAlert, IconArrowLeft } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { requireUser } from "@/lib/auth/guards";
import { recruiterTierBadge } from "@/lib/profile/badges";
import { getThreadForUser } from "@/lib/services/message";
import { cn } from "@/lib/utils";

import { resolveMessageNotice } from "../notices";
import { sendMessage } from "../actions";

export const metadata = { title: "Conversation", robots: { index: false, follow: false } };

const timeFmt = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dayFmt = new Intl.DateTimeFormat("en", { dateStyle: "full" });

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { user } = await requireUser();
  const { id } = await params;

  const result = await getThreadForUser(user.id, id);
  if (!result.ok) {
    if (result.reason === "not-found") notFound();
    redirect("/dashboard/messages?notice=not_allowed");
  }

  const { thread } = result;
  const { notice: noticeCode } = await searchParams;
  const notice = resolveMessageNotice(noticeCode);

  const other = thread.participants.find((p) => p.userId !== user.id)?.user ?? null;
  const name = other?.recruiter?.companyName ?? other?.freelancer?.displayName ?? "Unknown";
  const profileHref = other?.recruiter
    ? `/companies/${other.recruiter.slug}`
    : other?.freelancer
      ? `/freelancers/${other.freelancer.slug}`
      : null;
  // A thread has exactly two people, so identity belongs once — here. Putting
  // a face on every message group would repeat the same two images down the
  // page and crowd the words, which are the point.
  const isCompany = Boolean(other?.recruiter);
  const avatarSrc = other?.recruiter?.logoUrl ?? other?.freelancer?.avatarUrl;

  // Day separators, computed before rendering rather than by mutating a
  // variable inside the map — a render pass must not depend on how many times
  // it has run.
  const entries = thread.messages.map((message, i) => {
    const day = dayFmt.format(message.createdAt);
    const previous = thread.messages[i - 1];
    return {
      message,
      day,
      showDay: i === 0 || dayFmt.format(previous.createdAt) !== day,
    };
  });

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <nav className="mb-4">
          <Link
            href="/dashboard/messages"
            className="t-label inline-flex min-h-11 items-center gap-1.5 rounded-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <IconArrowLeft className="size-4" />
            All messages
          </Link>
        </nav>

        <header className="flex items-start gap-3 pb-4">
          {/* md, not lg: this header is a name and one line about the job, and
              a 72px mark beside a 24px heading would outweigh both. */}
          <Avatar
            name={name}
            src={avatarSrc}
            size="md"
            shape={isCompany ? "company" : "person"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {profileHref ? (
                <Link
                  href={profileHref}
                  className="t-heading rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {name}
                </Link>
              ) : (
                <h1 className="t-heading">{name}</h1>
              )}
              {other?.recruiter ? (
                <ProfileBadge spec={recruiterTierBadge(other.recruiter.tier)} />
              ) : null}
            </div>
            {thread.job ? (
              <p className="mt-1 text-[15px] text-muted-foreground">
                About{" "}
                <Link
                  href={`/jobs/${thread.job.slug}`}
                  className="rounded-xs underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {thread.job.title}
                </Link>
              </p>
            ) : null}
          </div>
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="mt-5">
            {notice.message}
          </Notice>
        ) : null}

        <ol className="mt-6 space-y-4">
          {entries.map(({ message, day, showDay }) => {
            const mine = message.senderId === user.id;

            return (
              <li key={message.id}>
                {showDay ? (
                  <p className="t-label my-4 text-center text-muted-foreground">{day}</p>
                ) : null}
                <div className={cn("flex", mine && "justify-end")}>
                  <div className={cn("max-w-[85%] border p-3", mine ? "border-foreground" : "border-border bg-muted")}>
                    <p className="t-label text-muted-foreground">
                      {mine ? "You" : name} · {timeFmt.format(message.createdAt)}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-[22px]">
                      {message.body}
                    </p>
                    {message.isFlagged ? (
                      <p className="mt-2 flex items-start gap-1.5 border-t border-border pt-2 text-[13px] leading-[18px] text-warning">
                        <IconAlert className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                          Flagged for review — this matches a pattern we watch for. It was
                          delivered either way; a moderator decides.
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <form action={sendMessage} className="mt-8 border-t border-border pt-6">
          <input type="hidden" name="conversationId" value={thread.id} />
          <Field
            label={`Reply to ${name}`}
            htmlFor="reply"
            hint="Share contact details freely if you want to — we do not restrict that."
          >
            <Textarea
              {...fieldControlProps("reply", { hint: "x" })}
              name="body"
              rows={4}
              maxLength={5000}
              required
              placeholder="Write your reply…"
            />
          </Field>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit">Send message</Button>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              Never pay to apply. No legitimate employer asks for a registration fee, a deposit,
              or equipment money.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
