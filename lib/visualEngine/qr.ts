import QRCode from "qrcode";

/**
 * Same pattern as scripts/generate-share-cards.js's makeQrDataUri — inline
 * SVG data URI, so the outro slide needs no client-side QR library. Runs
 * server-side in app/visual-preview/[slug]/page.tsx (an async server
 * component); any failure returns null and Outro simply omits the QR.
 */
export async function makeQrDataUri(url: string): Promise<string | null> {
  try {
    const svg = await QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#12161f", light: "#ffffff" },
    });
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return null;
  }
}
