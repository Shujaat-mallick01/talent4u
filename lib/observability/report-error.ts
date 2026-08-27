/**
 * The one place an unhandled error is reported from.
 *
 * There is no error-tracking service wired up. BUILD_PLAN 7.3 asks for Sentry,
 * and CLAUDE.md says not to add dependencies without asking, so this is the
 * seam rather than the thing: every boundary and every catch that wants to
 * report calls `reportError`, and adding Sentry later means changing this file
 * and nothing else.
 *
 * What it deliberately is NOT: a homegrown error pipeline. Posting client
 * errors to an endpoint of our own would mean unbounded log volume from
 * anything on the internet, a new abuse surface, and error strings — which
 * routinely contain query fragments, ids and occasionally an email address —
 * being written somewhere they were never designed to live. A real service
 * solves those problems; half of one creates them.
 *
 * So today this writes a structured line. On the server that lands in the
 * platform's log, which is searchable and already retains the `digest` Next
 * puts on every server error, so a reference a person quotes back can still be
 * found. On the client it reaches the browser console and no further, and that
 * limitation is the honest state of things until a service is chosen.
 */

export type ErrorContext = {
  /** Where it happened: "route-boundary", "global-boundary", a service name. */
  scope: string;
  /**
   * Next's hash for the failing server render. Present on server errors only,
   * and the one identifier that ties a user's report to a log line.
   */
  digest?: string;
  /** Anything else that helps, as long as it is not personal data. */
  extra?: Record<string, string | number | boolean | null>;
};

/** Never throws. A reporter that can fail is a second bug on top of the first. */
export function reportError(error: unknown, context: ErrorContext): void {
  try {
    const payload = {
      level: "error",
      scope: context.scope,
      ...(context.digest ? { digest: context.digest } : {}),
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      ...(context.extra ?? {}),
      at: new Date().toISOString(),
    };

    // One line of JSON: greppable, and parsed as structured data by every log
    // platform worth using. A multi-line console.error is not searchable.
    console.error(JSON.stringify(payload));
  } catch {
    // If even that fails there is nothing sensible left to do, and throwing
    // from inside an error boundary replaces a handled error with a crash.
  }
}
