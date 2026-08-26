import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth/guards";
import { timeAgo } from "@/lib/format/time";
import { recruiterTierBadge } from "@/lib/profile/badges";
import { getInboxForUser } from "@/lib/services/message";
import { cn } from "@/lib/utils";

import { resolveMessageNotice } from "./notices";

export const metadata = { title: "Messages" };

/**
 * The message inbox, shared by both roles.
 *
 * One row per thread, sharing a hairline, newest first — which is a single
 * index scan over ConversationParticipant, not a join-and-sort.
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { user } = await requireUser();
  const [inbox, params] = await Promise.all([getInboxForUser(user.id), searchParams]);

  if (!inbox.ok) {
    if (inbox.reason === "not-allowed" || inbox.reason === "no-account") redirect("/dashboard");
    redirect("/dashboard");
  }

  const notice = resolveMessageNotice(params.notice);
  const unread = inbox.conversations.filter((c) => c.isUnread).length;

  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        <header className="mb-6 pb-4">
          <h1 className="t-heading">Messages</h1>
          <p className="mt-2  text-[15px] leading-[22px] text-muted-foreground">
            Talk directly. Swap emails, phone numbers, anything — we do not police that and we
            never will. We only watch for the scam patterns: anyone asking you to pay to work.
          </p>
          {unread > 0 ? (
            <p className="t-label mt-3 text-primary">
              {unread} unread {unread === 1 ? "conversation" : "conversations"}
            </p>
          ) : null}
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="mb-6">
            {notice.message}
          </Notice>
        ) : null}

        {inbox.conversations.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            guidance="Threads start from an application. Open one and write the first message — that is the only way a conversation begins here, which is why nobody can cold-message you."
            action={
              <Button
                render={
                  <Link
                    href={user.role === "RECRUITER" ? "/dashboard/recruiter" : "/dashboard/freelancer"}
                  >
                    {user.role === "RECRUITER" ? "Go to your jobs" : "Go to your applications"}
                  </Link>
                }
              />
            }
          />
        ) : (
          <ul className="rowset">
            {inbox.conversations.map((c) => {
              const name =
                c.other?.recruiter?.companyName ?? c.other?.freelancer?.displayName ?? "Unknown";
              // Circles are people, the 2px square is a company. The shape is
              // the fastest read in the row: it says which side wrote to you
              // before a single word is parsed.
              const isCompany = Boolean(c.other?.recruiter);
              const avatarSrc = c.other?.recruiter?.logoUrl ?? c.other?.freelancer?.avatarUrl;
              return (
                <li key={c.id} className="relative">
                  {c.isUnread ? (
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
                  ) : null}
                  <Link
                    href={`/dashboard/messages/${c.id}`}
                    className={cn(
                      "row-hover flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5",
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    )}
                  >
                    {/* Fixed-width column: the avatar never grows and never
                        pushes the row wider — the text beside it truncates. */}
                    <Avatar
                      name={name}
                      src={avatarSrc}
                      size="md"
                      shape={isCompany ? "company" : "person"}
                    />
                    <div className="min-w-[14rem] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("truncate", c.isUnread ? "font-semibold" : "font-medium")}>
                          {name}
                        </span>
                        {c.other?.recruiter ? (
                          <ProfileBadge spec={recruiterTierBadge(c.other.recruiter.tier)} />
                        ) : null}
                        {c.isUnread ? (
                          <span className="t-label text-primary">Unread</span>
                        ) : null}
                      </div>
                      {c.job ? (
                        <p className="mt-0.5 truncate text-[15px] text-muted-foreground">
                          {c.job.title}
                        </p>
                      ) : null}
                      {c.latest ? (
                        <p className="mt-1 truncate text-[15px] text-muted-foreground">
                          {c.latest.senderId === user.id ? "You: " : ""}
                          {c.latest.body}
                        </p>
                      ) : null}
                    </div>
                    <span className="t-label w-24 shrink-0 text-right text-muted-foreground">
                      {timeAgo(c.lastMessageAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
