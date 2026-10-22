// Words that only describe the legal form of a company, not who it is.
const SUFFIXES = new Set([
  "co", "ltd", "limited", "company", "corp", "corporation", "inc", "incorporated",
  "llc", "llp", "pvt", "private", "gmbh", "sdn", "bhd", "plc", "the",
]);
const CHINESE_SUFFIXES = ["有限责任公司", "有限公司", "股份有限公司"];

// "Shenzhen XYZ Tech Co., Ltd." and "Shenzhen XYZ Tech Limited" both become "shenzhen xyz tech".
export function normalizeName(raw: string): string {
  let s = raw.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  for (const suffix of CHINESE_SUFFIXES) s = s.replaceAll(suffix, " ");
  s = s.replaceAll("&", " and ").replace(/[^\p{L}\p{N}\s]/gu, " ");
  return s
    .split(/\s+/)
    .filter((word) => word && !SUFFIXES.has(word))
    .join(" ");
}

export type NameMatch = "same" | "similar" | "different";

// same = identical after cleaning. similar = they share at least half their words.
export function compareNames(a: string, b: string): NameMatch {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return "different";
  if (x === y) return "same";
  const xs = new Set(x.split(" "));
  const ys = new Set(y.split(" "));
  let shared = 0;
  for (const word of xs) if (ys.has(word)) shared++;
  return shared / Math.min(xs.size, ys.size) >= 0.5 ? "similar" : "different";
}
