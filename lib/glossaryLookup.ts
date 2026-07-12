import fs from "fs";
import path from "path";

export interface TermDefinition {
  term: string;
  definition: string;
}

let cache: { term: string; definition: string; key: string }[] | null = null;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "") // "Offer-for-Sale (OFS)" ≈ "Offer-for-Sale"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadGlossary() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "glossary.json"), "utf8")
    ) as { term: string; definition: string }[];
    cache = raw.map((e) => ({ ...e, key: normalize(e.term) }));
  } catch {
    cache = [];
  }
  return cache;
}

/**
 * Server-side: map a story's knowledgeChain term names onto their
 * cumulative-glossary definitions. Terms without a glossary entry are
 * still returned (with an empty definition) so the strip stays complete —
 * the client renders those as plain chips without an expandable panel.
 */
export function getTermDefinitions(terms: string[]): TermDefinition[] {
  const glossary = loadGlossary();
  return terms.map((term) => {
    const key = normalize(term);
    const hit =
      glossary.find((g) => g.key === key) ??
      glossary.find((g) => g.key.includes(key) || key.includes(g.key));
    return { term, definition: hit?.definition ?? "" };
  });
}
