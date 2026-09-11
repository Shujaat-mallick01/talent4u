import { SITE_URL } from "@/lib/site-url";

/**
 * The email shell.
 *
 * Written as plain functions returning HTML rather than with React Email,
 * because an email is not a React app: every style must be inlined, the layout
 * has to survive Outlook's table renderer, and the JSX layer would buy nothing
 * a template literal does not already do here.
 *
 * Same brand as the product, translated into what mail clients support:
 * hairline rules instead of borders-plus-shadow, one Signal Red accent, system
 * fallbacks for Archivo and Plex Mono (neither is loadable in most clients, so
 * the stack degrades to something with the same proportions rather than to
 * Times New Roman).
 */

const INK = "#0E0E10";
const GRAPHITE = "#3A3A40";
const SLATE = "#585860";
const LINE = "#E2E2E5";
const MIST = "#F4F4F5";
const PAPER = "#FFFFFF";
const RED = "#E51315";

const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A primary action. One per email — the same rule the product follows. */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr><td style="background:${RED};border-radius:2px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;font-family:${SANS};font-size:15px;font-weight:600;color:${PAPER};text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr>
</table>`;
}

/** A ruled label/value row — the product's data panel, in mail. */
export function factRow(label: string, value: string): string {
  return `<tr>
  <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${MONO};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${SLATE};">${escapeHtml(label)}</td>
  <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${MONO};font-size:14px;color:${INK};text-align:right;">${escapeHtml(value)}</td>
</tr>`;
}

export function facts(rows: [string, string][]): string {
  if (rows.length === 0) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;border-top:1px solid ${LINE};">
  ${rows.map(([l, v]) => factRow(l, v)).join("\n")}
</table>`;
}

/** A quoted excerpt — a message body, a cover letter. */
export function quote(text: string): string {
  return `<div style="margin:16px 0;padding:12px 16px;background:${MIST};border-left:2px solid ${LINE};font-family:${SANS};font-size:15px;line-height:22px;color:${GRAPHITE};white-space:pre-wrap;">${escapeHtml(text)}</div>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:26px;color:${GRAPHITE};">${text}</p>`;
}

/**
 * A list of jobs, for the weekly digest.
 *
 * Each row is a link on the title, because the title is what a person decides
 * from and what their thumb lands on. Budget sits in the mono stack so a
 * column of numbers lines up, the way it does everywhere else in the product.
 */
export function jobList(
  jobs: {
    title: string;
    companyName: string;
    /** Verification tier label, rendered beside the company on every row. */
    tier: string;
    budget: string | null;
    href: string;
  }[],
): string {
  if (jobs.length === 0) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;border-top:1px solid ${LINE};">
${jobs
  .map(
    (j) => `  <tr><td style="padding:14px 0;border-bottom:1px solid ${LINE};">
    <a href="${escapeHtml(j.href)}" style="font-family:${SANS};font-size:16px;line-height:22px;font-weight:600;color:${INK};text-decoration:none;">${escapeHtml(j.title)}</a>
    <div style="margin-top:4px;font-family:${SANS};font-size:14px;line-height:20px;color:${SLATE};">${escapeHtml(j.companyName)} &middot; ${escapeHtml(j.tier)}${
      j.budget
        ? ` &middot; <span style="font-family:${MONO};">${escapeHtml(j.budget)}</span>`
        : ""
    }</div>
  </td></tr>`,
  )
  .join("\n")}
</table>`;
}

/**
 * Wraps a body in the shell.
 *
 * `reason` is not boilerplate: it says why this specific person is receiving
 * this specific email, which is the thing that separates a notification from
 * spam in a reader's head — and these are strictly transactional, sent only
 * about the recipient's own activity.
 */
export function emailLayout(args: {
  heading: string;
  body: string;
  reason: string;
  preheader: string;
  /**
   * Only for mail that is not transactional. Everything triggered by another
   * person's action on your own account carries no unsubscribe link and needs
   * none; the weekly digest is the one thing that does, and it must be
   * refusable in one click without signing in.
   */
  unsubscribeUrl?: string;
}): string {
  const { heading, body, reason, preheader, unsubscribeUrl } = args;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${MIST};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${MIST};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:${PAPER};border:1px solid ${LINE};">
      <tr><td style="padding:20px 28px;border-bottom:1px solid ${LINE};">
        <a href="${SITE_URL}" style="font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:-0.02em;color:${INK};text-decoration:none;">TALENT<span style="color:${RED};">4U</span></a>
      </td></tr>
      <tr><td style="padding:28px;">
        <h1 style="margin:0 0 16px;font-family:${SANS};font-size:22px;line-height:28px;font-weight:700;letter-spacing:-0.02em;color:${INK};">${escapeHtml(heading)}</h1>
        ${body}
      </td></tr>
      <tr><td style="padding:20px 28px;border-top:1px solid ${LINE};">
        <p style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:18px;color:${SLATE};">${escapeHtml(reason)}</p>
        <p style="margin:0;font-family:${SANS};font-size:13px;line-height:18px;color:${SLATE};">
          Talent4u takes 0% commission. We never hold or transfer your money, and we never ask you to pay to apply.
        </p>${
          unsubscribeUrl
            ? `
        <p style="margin:8px 0 0;font-family:${SANS};font-size:13px;line-height:18px;color:${SLATE};">
          <a href="${escapeHtml(unsubscribeUrl)}" style="color:${SLATE};">Stop sending me this digest</a> — one click, no sign-in, and it does not affect mail about your own applications.
        </p>`
            : ""
        }
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** The plain-text half. Never omitted — some readers only ever see this. */
export function textEmail(args: {
  heading: string;
  lines: string[];
  action?: { label: string; href: string };
  reason: string;
  unsubscribeUrl?: string;
}): string {
  const parts = [args.heading, "", ...args.lines];
  if (args.action) parts.push("", `${args.action.label}: ${args.action.href}`);
  parts.push("", "—", args.reason, "Talent4u takes 0% commission and never asks you to pay to apply.");
  if (args.unsubscribeUrl) {
    parts.push("", `Stop sending me this digest: ${args.unsubscribeUrl}`);
  }
  return parts.join("\n");
}

export const url = (path: string): string => `${SITE_URL}${path}`;
