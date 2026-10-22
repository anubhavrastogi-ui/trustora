import { ConfigError, extract } from "../../../lib/extract.ts";
import { runRules, validateInput } from "../../../lib/rules.ts";
import { verifyExtraction } from "../../../lib/verifyQuotes.ts";
import type { FormInput, RulesInput } from "../../../lib/types.ts";

export const maxDuration = 60;

const MAX_CHARS = 20_000;

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const started = Date.now();

  let body: Partial<FormInput>;
  try {
    body = await req.json();
  } catch {
    return fail("The request could not be read.", 400);
  }

  const form: FormInput = {
    listing: String(body.listing ?? "").slice(0, MAX_CHARS),
    chat: String(body.chat ?? "").slice(0, MAX_CHARS),
    companyName: String(body.companyName ?? "").trim().slice(0, 300),
    bankName: String(body.bankName ?? "").trim().slice(0, 300),
    licence: String(body.licence ?? "").trim().slice(0, 100) || undefined,
  };

  // Plain-code check first. Bad input never reaches Claude.
  const valid = validateInput(form);
  if (!valid.ok) return fail(valid.message, 400);

  try {
    const { extraction, usage } = await extract(form);

    const text = `${form.listing}\n${form.chat}`;
    const v = verifyExtraction(extraction, text);

    // A licence the buyer typed in is theirs to trust. One Claude found must be quoted.
    const licence = form.licence ?? v.licence?.value ?? null;
    const licenceQuote = form.licence ? null : (v.licence?.quote ?? null);

    const rulesInput: RulesInput = {
      companyName: form.companyName,
      bankName: form.bankName,
      companyQuote: v.companyQuote,
      bankQuote: v.bankQuote,
      licence,
      licenceQuote,
      address: v.address?.value ?? null,
      addressQuote: v.address?.quote ?? null,
      namesSeen: v.namesSeen,
    };

    const report = runRules(rulesInput);
    const elapsedMs = Date.now() - started;
    console.log(
      `[check] ${elapsedMs}ms in=${usage.inputTokens} out=${usage.outputTokens} tokens, dropped_unverified=${v.dropped}, overall=${report.overall}`,
    );

    return Response.json({
      report,
      followUpQuestions: extraction.follow_up_questions.slice(0, 6),
      note: "Based only on what the supplier provided. This does not check official records.",
      meta: { elapsedMs, ...usage, droppedUnverified: v.dropped },
    });
  } catch (err) {
    console.error("[check] failed:", err instanceof Error ? err.message : err);
    if (err instanceof ConfigError) {
      return fail("The server is missing its API key.", 500);
    }
    return fail("We couldn't analyse this supplier right now. Please try again.", 502);
  }
}
