import type { Extraction, Found, NameSeen } from "./types.ts";

// Lowercase and collapse whitespace so line breaks or double spaces don't break a match.
function clean(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// True only if the quote really appears in the text the buyer pasted.
export function quoteIsReal(quote: string, haystack: string): boolean {
  const q = clean(quote);
  return q.length > 0 && clean(haystack).includes(q);
}

// Keeps only what can be traced to the pasted text. Anything else is dropped,
// so a made-up fact can never reach the report.
export function verifyExtraction(
  ex: Extraction,
  text: string,
): {
  companyQuote: string | null;
  bankQuote: string | null;
  licence: Found | null;
  address: Found | null;
  namesSeen: NameSeen[];
  dropped: number;
} {
  let dropped = 0;
  const keep = <T extends { quote: string }>(item: T | null): T | null => {
    if (!item) return null;
    if (quoteIsReal(item.quote, text)) return item;
    dropped++;
    return null;
  };
  return {
    companyQuote: keep(ex.company_line)?.quote ?? null,
    bankQuote: keep(ex.bank_line)?.quote ?? null,
    licence: keep(ex.licence),
    address: keep(ex.address),
    namesSeen: ex.names_seen.filter((n) => keep(n) !== null),
    dropped,
  };
}
