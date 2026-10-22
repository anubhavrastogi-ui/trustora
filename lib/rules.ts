import { compareNames } from "./normalizeName.ts";
import type { Check, FormInput, Report, RulesInput, Status } from "./types.ts";

// Hard rules. No AI in this file: every colour is decided here.

const RANK: Record<Status, number> = { green: 0, amber: 1, red: 2 };

export function validateInput(
  form: FormInput,
): { ok: true } | { ok: false; message: string } {
  const evidence = `${form.listing} ${form.chat}`.trim();
  if (!form.companyName.trim() || !form.bankName.trim()) {
    return { ok: false, message: "Enter the company name and the bank-account name from the invoice." };
  }
  if (evidence.length < 40) {
    return { ok: false, message: "Paste the supplier's listing or chat text. There is too little to check." };
  }
  return { ok: true };
}

function bankCheck(i: RulesInput): Check {
  const quotes = [
    { label: "Company name", text: i.companyQuote ?? i.companyName },
    { label: "Bank account name", text: i.bankQuote ?? i.bankName },
  ];
  const match = compareNames(i.companyName, i.bankName);
  if (match === "same") {
    return { id: "bank_vs_company", label: "Bank account vs. company name", status: "green", quotes,
      reason: "The bank account name matches the company name." };
  }
  if (match === "similar") {
    return { id: "bank_vs_company", label: "Bank account vs. company name", status: "amber", quotes,
      reason: "The bank account name is close to the company name but not the same. Ask them to confirm in writing." };
  }
  return { id: "bank_vs_company", label: "Bank account vs. company name", status: "red", quotes,
    reason: "STOP. The bank account name doesn't match the company name. Don't pay until this is explained." };
}

function consistencyCheck(i: RulesInput): Check {
  const label = "Company name across documents";
  // The bank account name is judged by the bank check above. Skipping it here
  // stops the same mismatch from showing up twice.
  const seen = i.namesSeen.filter((n) => compareNames(i.bankName, n.name) === "different"
    || compareNames(i.companyName, n.name) !== "different");
  const quotes = seen.map((n) => ({ label: n.source, text: n.quote }));
  const matches = seen.map((n) => compareNames(i.companyName, n.name));
  if (matches.includes("different")) {
    return { id: "name_consistency", label, status: "red", quotes,
      reason: "Another document names a company that looks different from the one on the invoice." };
  }
  if (matches.includes("similar")) {
    return { id: "name_consistency", label, status: "amber", quotes,
      reason: "The company name is written differently in different places. Ask which legal entity you are buying from." };
  }
  if (seen.length === 0) {
    return { id: "name_consistency", label, status: "amber", quotes,
      reason: "No company name was found in the pasted text to compare against." };
  }
  return { id: "name_consistency", label, status: "green", quotes,
    reason: "The company name is the same everywhere it appears." };
}

function presenceCheck(
  id: "licence" | "address",
  label: string,
  value: string | null,
  quote: string | null,
  givenReason: string,
  missingReason: string,
): Check {
  if (value) {
    return { id, label, status: "green", reason: givenReason,
      quotes: [{ label, text: quote ?? value }] };
  }
  return { id, label, status: "amber", reason: missingReason, quotes: [] };
}

export function runRules(i: RulesInput): Report {
  const checks: Check[] = [
    bankCheck(i),
    consistencyCheck(i),
    presenceCheck("licence", "Business licence number", i.licence, i.licenceQuote,
      "A licence number was given. It is not checked against any official registry.",
      "No licence number was found. Ask for it."),
    presenceCheck("address", "Company address", i.address, i.addressQuote,
      "An address was given. It is not verified.",
      "No company address was found. Ask for it."),
    {
      id: "factory_vs_trader",
      label: "Factory or trader?",
      status: "amber",
      quotes: [],
      reason: "Not enough evidence to say. Ask for a live video walk of the production line and the export licence.",
    },
  ];

  const askFor: string[] = [];
  if (!i.licence) askFor.push("Business licence number");
  if (!i.address) askFor.push("Registered company address");

  const overall = checks.reduce<Status>(
    (worst, c) => (RANK[c.status] > RANK[worst] ? c.status : worst),
    "green",
  );
  return { overall, checks, askFor };
}
