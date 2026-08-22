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
