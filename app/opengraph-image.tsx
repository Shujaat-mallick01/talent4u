import { ImageResponse } from "next/og";

/**
 * The card every non-job page shows when it is shared.
 *
 * Built with next/og, which ships with Next — no image service, no headless
 * browser, no new dependency. It renders at request time and is cached by the
 * platform, so the cost is one render per URL rather than per share.
 *
 * The design is the brand's, translated into the subset Satori supports: no
 * external fonts (they would have to be fetched and embedded on every render),
 * no shadows, flex only. What survives is what actually carries the brand at
 * card size — Ink, one Signal Red accent, and the claim itself.
 */

export const runtime = "nodejs";
export const alt = "Talent4u — 0% commission hiring";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0E0E10";
const RED = "#E51315";
const SLATE = "#585860";
const LINE = "#E2E2E5";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FFFFFF",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[22, 16, 11, 7].map((d, i) => (
              <div
                key={i}
                style={{ width: d, height: d, borderRadius: d, background: RED }}
              />
            ))}
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: INK, letterSpacing: -0.5 }}>
            TALENT4U
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              color: INK,
              letterSpacing: -2.5,
              lineHeight: 1.05,
            }}
          >
            Keep 100% of
          </div>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              color: INK,
              letterSpacing: -2.5,
              lineHeight: 1.05,
            }}
          >
            what you earn.
          </div>
          <div style={{ fontSize: 30, color: SLATE, marginTop: 28, maxWidth: 820 }}>
            Commission-free hiring. We never hold the money, so we are never in a position to
            take a cut of it.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${LINE}`,
            paddingTop: 28,
            fontSize: 24,
            color: SLATE,
          }}
        >
          <div style={{ display: "flex" }}>talent4u.com</div>
          <div style={{ display: "flex", color: RED, fontWeight: 700 }}>0% commission</div>
        </div>
      </div>
    ),
    size,
  );
}
