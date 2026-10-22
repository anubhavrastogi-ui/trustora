export type Status = "green" | "amber" | "red";

export type Source = "listing" | "chat" | "invoice";

// What the buyer types into the form.
export type FormInput = {
  listing: string;
  chat: string;
  companyName: string;
  bankName: string;
  licence?: string;
};

// A name found in the pasted text, with the line it came from.
export type NameSeen = { name: string; quote: string; source: Source };

// What the rules need. Step 3 fills this from the form and from Claude's extraction.
export type RulesInput = {
  companyName: string;
  bankName: string;
  companyQuote: string | null; // line showing the company name (e.g. on the invoice)
  bankQuote: string | null; // line showing the bank account name
  licence: string | null;
  licenceQuote: string | null;
  address: string | null;
  addressQuote: string | null;
  namesSeen: NameSeen[];
};

// A value Claude found, with the exact line it was copied from.
export type Found = { value: string; quote: string };

// What Claude returns. Every quote must be verified against the pasted text before use.
export type Extraction = {
  company_line: { quote: string } | null;
  bank_line: { quote: string } | null;
  licence: Found | null;
  address: Found | null;
  names_seen: NameSeen[];
  follow_up_questions: string[];
};

export type CheckId =
  | "bank_vs_company"
  | "name_consistency"
  | "licence"
  | "address"
  | "factory_vs_trader";

export type Check = {
  id: CheckId;
  label: string;
  status: Status;
  reason: string; // plain-code default; Step 3 may swap in a clearer wording from Claude
  quotes: { label: string; text: string }[];
};

export type Report = {
  overall: Status;
  checks: Check[];
  askFor: string[]; // things to request from the supplier
};
