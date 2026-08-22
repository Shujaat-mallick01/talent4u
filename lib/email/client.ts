/**
 * The email transport.
 *
 * CLAUDE.md names Resend. This talks to Resend's HTTP API directly with fetch
 * rather than adding their SDK: sending an email is one authenticated POST,
 * and a dependency whose entire job is to wrap a single request is not worth
 * the supply-chain surface on a path that handles user addresses.
 *
 * Three behaviours, decided by configuration rather than by NODE_ENV, so a
 * misconfigured production deploy fails loudly instead of silently dropping
 * mail:
 *   - No API key in development  -> log the message and report it as skipped.
 *   - No API key in production   -> report a failure the caller can log.
 *   - API key present            -> send.
 */

export type EmailAddress = string;

export type OutboundEmail = {
  to: EmailAddress;
  subject: string;
  html: string;
  /** Always provide one — some clients and most spam filters want it. */
  text: string;
  /** Threads replies in a mail client rather than starting a new one. */
  headers?: Record<string, string>;
};

export type SendResult =
  | { ok: true; id: string | null; skipped: boolean }
  | { ok: false; error: string };

const ENDPOINT = "https://api.resend.com/emails";

/** Who mail comes from. Must be a domain verified in the Resend dashboard. */
export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? "Talent4u <notifications@talent4u.example>";
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(email: OutboundEmail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "RESEND_API_KEY is not set" };
    }
    // Development without a key: show what would have gone out. This is the
    // difference between "notifications are wired up" and "I assumed they
    // were", and it costs nothing.
    console.log(
      `\n[email] would send to ${email.to}\n        subject: ${email.subject}\n${email.text
        .split("\n")
        .map((l) => `        ${l}`)
        .join("\n")}\n`,
    );
    return { ok: true, id: null, skipped: true };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.headers ? { headers: email.headers } : {}),
      }),
      // A slow mail API must never hold a user's request open. The caller
      // already treats sending as best-effort; this bounds the wait.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, error: `Resend ${response.status}: ${detail.slice(0, 200)}` };
    }

    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id ?? null, skipped: false };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : "send failed" };
  }
}
