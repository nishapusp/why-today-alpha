/** Extracts the first numeric run from a formatted value like "₹24 lakh crore" or "33%". */
export function parseLeadingNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}
