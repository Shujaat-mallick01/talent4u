import { z } from "zod";

/**
 * Message input.
 *
 * CLAUDE.md is explicit that we do NOT enforce anti-circumvention: "users may
 * freely exchange contact info — this is a feature". So nothing here strips
 * emails, phone numbers or handles, and nothing ever should. What the message
 * body IS run through is the automated safety scanner
 * (lib/services/message-safety.ts), which looks for upfront-payment demands
 * and off-platform payment requests — the scam patterns, not the contact
 * details.
 */

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Write a message first.")
  .max(5000, "Keep it under 5,000 characters. Long briefs are better as an attachment or a link.");

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  body: messageBodySchema,
});

/**
 * Starting a thread. The application is the only thing a caller names — both
 * participants are derived from it server-side, so a request cannot open a
 * conversation between two people it has nothing to do with.
 */
export const startConversationSchema = z.object({
  applicationId: z.string().min(1),
  body: messageBodySchema,
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type StartConversationInput = z.infer<typeof startConversationSchema>;

/**
 * Recruiter outreach from candidate search.
 *
 * A freelancer and one of the recruiter's own jobs — the job is what tells the
 * person on the other end why a stranger is writing to them, and it is what
 * bounds outreach to work that actually exists. Both ids are resolved and
 * ownership-checked server-side; naming them here grants nothing.
 */
export const startOutreachSchema = z.object({
  freelancerId: z.string().min(1),
  jobId: z.string().min(1),
  body: messageBodySchema,
});

export type StartOutreachInput = z.infer<typeof startOutreachSchema>;
