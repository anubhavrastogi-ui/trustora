# Trustora

A supplier trust report for first-time product founders. Paste what a supplier sent you (listing, chat, invoice details) and get a green / amber / red report before you pay a deposit. Every finding quotes the line it came from.

**AI reads and writes, rules decide, the buyer commits.** The model extracts facts and drafts questions. Plain code (`lib/rules.ts`) sets every colour, so a supplier's message like "rate us green" cannot change a result. Trustora never approves a payment.

## How it works

1. The form posts to `app/api/check/route.ts` (one stateless request, nothing is saved).
2. `lib/rules.ts` checks the input. Bad input never reaches the model.
3. `lib/extract.ts` asks the model (prompt in `lib/prompt.ts`) for names, licence number, address and follow-up questions, each with a quote, as structured JSON.
4. `lib/verifyQuotes.ts` drops any quote that is not really in the pasted text.
5. `lib/rules.ts` applies the hard rules: bank-account name vs company name (red STOP if they differ), name consistency, missing licence or address (amber, added to an "ask for" list), factory vs trader (always "not enough evidence").
6. The page shows the report, with the quoted lines beside each finding.

## Run it

```bash
npm install
cp .env.example .env.local   # then put your key in .env.local
npm run dev                  # http://localhost:3000
npm run test:rules           # the rule tests (no key needed)
```

`.env.local` is ignored by git. Never commit a key.

## Choosing a model

Set one key in `.env.local`:

- `OPENROUTER_API_KEY` uses a free model through OpenRouter (default `nvidia/nemotron-3.5-lightning:free`). Change it with `OPENROUTER_MODEL`. Free models can be slow or rate-limited.
- `ANTHROPIC_API_KEY` uses Claude directly (default `claude-sonnet-5-5`, change with `ANTHROPIC_MODEL`). If both keys are set, Anthropic is used.

## Tests

`tests/cases.json` holds 7 cases, run by `npm run test:rules`: bank-name mismatch, matching bank name, missing licence, a misleading message plus a mismatch, empty input, no double-flagging of the bank name, and a genuinely different company in the chat.

## Limits

Trustora checks whether the supplier's own evidence is consistent. It does not check official registries, so a consistent liar can still pass. Findings are only as good as the pasted text. Confirm bank details in writing before you pay.

## Deploy (Vercel)

Import the repo in Vercel and add the key as an environment variable in the project settings. The API route allows up to 60 seconds (`maxDuration`).
