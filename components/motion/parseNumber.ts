/** Extracts the first numeric run from a formatted value like "₹24 lakh crore" or "33%". */
export function parseLeadingNumber(value: string): number | null {
  // KeyNumber.value is typed as string, but nothing enforces that at
  // generation time — a real archived story shipped a bare JSON number
  // (1, not "1"), which crashed the entire Netlify build the moment this
  // ran during static prerendering (numbers have no .replace method).
  // String(value) makes this safe regardless of what actually lands here.
  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}
