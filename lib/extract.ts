import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, TOOL, buildUserMessage } from "./prompt.ts";
import type { Extraction, FormInput } from "./types.ts";

// Two ways to reach a model. The key lives only in .env.local on the server.
//  - ANTHROPIC_API_KEY set  -> Claude directly (paid).
//  - OPENROUTER_API_KEY set -> a free model through OpenRouter (default).
const ANTHROPIC_MODEL = "claude-sonnet-5-5";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_DEFAULT_MODEL = "minimax/minimax-m3.1-flash:free";

export class ConfigError extends Error {}
export class ExtractError extends Error {}

type Usage = { inputTokens: number; outputTokens: number };

function isSet(v: string | undefined): v is string {
  return !!v && v !== "your-key-here";
}

const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

// Models sometimes return a field in the wrong shape. Keep only well-formed items,
// so a bad field is dropped (treated as "not found") instead of crashing the report.
function checkShape(raw: unknown): Extraction {
  if (!raw || typeof raw !== "object") {
    throw new ExtractError("The model returned findings in an unexpected shape");
  }
  const r = raw as Record<string, unknown>;
  const line = (v: unknown) =>
    v && typeof v === "object" && isText((v as { quote?: unknown }).quote)
      ? { quote: (v as { quote: string }).quote }
      : null;
  const found = (v: unknown) => {
    const o = v as { value?: unknown; quote?: unknown } | null;
    return o && typeof o === "object" && isText(o.value) && isText(o.quote)
      ? { value: o.value, quote: o.quote }
      : null;
  };
  const names = Array.isArray(r.names_seen) ? r.names_seen : [];
  return {
    company_line: line(r.company_line),
    bank_line: line(r.bank_line),
    licence: found(r.licence),
    address: found(r.address),
    names_seen: names.flatMap((n: { name?: unknown; quote?: unknown; source?: unknown }) =>
      n && isText(n.name) && isText(n.quote)
        ? [{ name: n.name, quote: n.quote, source: n.source === "chat" ? ("chat" as const) : ("listing" as const) }]
        : [],
    ),
    follow_up_questions: (Array.isArray(r.follow_up_questions) ? r.follow_up_questions : []).filter(isText),
  };
}

async function viaAnthropic(apiKey: string, form: FormInput): Promise<{ extraction: Extraction; usage: Usage }> {
  const client = new Anthropic({ apiKey, timeout: 50_000, maxRetries: 1 });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || ANTHROPIC_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: buildUserMessage(form) }],
  });
  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new ExtractError("The model did not return structured findings");
  }
  return {
    extraction: checkShape(block.input),
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}

type OpenRouterResponse = {
  choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

async function viaOpenRouter(apiKey: string, form: FormInput): Promise<{ extraction: Extraction; usage: Usage }> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Trustora",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL,
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(form) },
      ],
      tools: [
        { type: "function", function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.input_schema } },
      ],
      tool_choice: { type: "function", function: { name: TOOL.name } },
    }),
    signal: AbortSignal.timeout(50_000),
  });

  const data = (await res.json().catch(() => ({}))) as OpenRouterResponse;
  if (!res.ok) {
    throw new ExtractError(`OpenRouter returned ${res.status}: ${data.error?.message ?? "no details"}`);
  }
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new ExtractError("The model did not return structured findings");

  let ex: unknown;
  try {
    ex = JSON.parse(args);
  } catch {
    throw new ExtractError("The model returned findings that could not be read");
  }
  return {
    extraction: checkShape(ex),
    usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
  };
}

export async function extract(form: FormInput) {
  if (isSet(process.env.ANTHROPIC_API_KEY)) return viaAnthropic(process.env.ANTHROPIC_API_KEY, form);
  if (isSet(process.env.OPENROUTER_API_KEY)) return viaOpenRouter(process.env.OPENROUTER_API_KEY, form);
  throw new ConfigError("No API key found in .env.local (ANTHROPIC_API_KEY or OPENROUTER_API_KEY)");
}
