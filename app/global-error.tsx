"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/observability/report-error";

/**
 * The last boundary: an error thrown by the root layout itself.
 *
 * This replaces the whole document, so it renders its own <html> and <body>,
 * and it cannot rely on globals.css, the font variables or any component in
 * the design system having loaded — every value below is inlined by hand from
 * the brand tokens (Paper #FFFFFF, Ink #0E0E10, Slate #585860, Line #E2E2E5,
 * Signal Red #E51315 deepening to #A80E10, 2px radius, no shadow).
 *
 * The only stylesheet is the tiny <style> block, which exists for the one
 * thing an inline `style` attribute cannot express: the focus ring. Losing it
 * here would leave a keyboard user with a dead-end page and no visible caret.
 */

const FALLBACK_CSS = `
  *,*::before,*::after{box-sizing:border-box}
  a:hover{background:#f4f4f5}
  button:hover{background:#a80e10}
  :focus-visible{outline:2px solid #1b4fd1;outline-offset:2px}
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { scope: "global-boundary", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#ffffff",
          color: "#0e0e10",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <style>{FALLBACK_CSS}</style>
        <main id="main" style={{ maxWidth: "42rem", padding: "64px 24px" }}>
          <p
            style={{
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              lineHeight: "16px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#585860",
            }}
          >
            Error · Talent4u did not load
          </p>
          <h1
            style={{
              margin: "8px 0 0",
              fontSize: 32,
              lineHeight: "38px",
              fontWeight: 700,
              letterSpacing: "-0.022em",
            }}
          >
            Talent4u failed to start
          </h1>
          <p style={{ margin: "16px 0 0", maxWidth: "62ch", fontSize: 17, lineHeight: "28px", color: "#585860" }}>
            This one is ours, not yours — the page could not be built at all, so none of it
            rendered. Reload it; if the same thing happens twice, come back in a few minutes.
          </p>

          <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                height: 44,
                padding: "0 24px",
                border: "1px solid transparent",
                borderRadius: 2,
                background: "#e51315",
                color: "#ffffff",
                fontFamily: "inherit",
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the root
                layout is what failed, so the router is not trustworthy here. A plain
                anchor forces a full document load, which is the point. */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 44,
                padding: "0 24px",
                border: "1px solid #0e0e10",
                borderRadius: 2,
                color: "#0e0e10",
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Go to the home page
            </a>
          </div>

          {error.digest ? (
            <p
              style={{
                margin: "48px 0 0",
                paddingTop: 16,
                borderTop: "1px solid #e2e2e5",
                fontSize: 15,
                lineHeight: "22px",
                color: "#585860",
              }}
            >
              <span
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 12,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Reference
              </span>{" "}
              <span
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontVariantNumeric: "tabular-nums",
                  color: "#0e0e10",
                }}
              >
                {error.digest}
              </span>
              <span style={{ display: "block", marginTop: 4 }}>
                Quote this if you write to us — it points at the exact request that failed.
              </span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
