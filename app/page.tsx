"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Check, Report, Status } from "../lib/types.ts";
import styles from "./page.module.css";

type Result = {
  report: Report;
  followUpQuestions: string[];
  note: string;
  meta: { elapsedMs: number; inputTokens: number; outputTokens: number; droppedUnverified: number };
};

type FormState = { listing: string; chat: string; companyName: string; bankName: string; licence: string };

const EMPTY: FormState = { listing: "", chat: "", companyName: "", bankName: "", licence: "" };

const EXAMPLES: { label: string; form: FormState }[] = [
  {
    label: "Bank name doesn't match",
    form: {
      listing:
        "Shenzhen Bright Tech Co., Ltd. Manufacturer of LED lamps, 12 years in business. Factory tour on request. Address: Bao'an District, Shenzhen.",
      chat: "Hi, thanks for your order. Please pay the 30% deposit to the account of Lin Trading Group. Our business licence number is 914403001234567890.",
      companyName: "Shenzhen Bright Tech Co., Ltd.",
      bankName: "Lin Trading Group",
      licence: "",
    },
  },
  {
    label: "Details line up",
    form: {
      listing:
        "Dongguan Sunrise Plastics Co., Ltd. We manufacture phone cases and silicone products in our own 3,000 sqm workshop. Registered address: 18 Industrial Road, Chang'an Town, Dongguan.",
      chat: "Hello! Our unified social credit code is 91441900MA4UXXXXX1. For the proforma invoice, please pay to account name: Dongguan Sunrise Plastics Co., Ltd. MOQ is 500 pieces.",
      companyName: "Dongguan Sunrise Plastics Co., Ltd.",
      bankName: "Dongguan Sunrise Plastics Limited",
      licence: "",
    },
  },
];

const LOADING_STEPS = [
  "Reading what the supplier sent…",
  "Pulling out names, licence and address…",
  "Checking every quote against your text…",
  "Applying the rules…",
];

const WORD: Record<Status, string> = { green: "OK", amber: "Check", red: "Stop" };
const ICON: Record<Status, string> = { green: "✓", amber: "!", red: "✕" };
const ORDER: Record<Status, number> = { red: 0, amber: 1, green: 2 };

const VERDICT: Record<Status, { title: string; body: string }> = {
  red: {
    title: "Stop. Don't pay a deposit yet.",
    body: "At least one check failed in a way that matches how deposit scams work. Get it explained in writing first.",
  },
  amber: {
    title: "Not enough to trust yet.",
    body: "Nothing here is a hard stop, but some checks need more proof. Ask the questions below before you pay.",
  },
  green: {
    title: "The supplier's details are consistent.",
    body: "Everything they gave you lines up. That only means their own story is consistent, so still confirm bank details in writing.",
  },
};

function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className ?? styles.copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard not available; the text can still be selected by hand */
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

function CheckItem({ check }: { check: Check }) {
  return (
    <li>
      <details className={`${styles.check} ${styles[check.status]}`} open={check.status !== "green"}>
        <summary>
          <span className={styles.pill}>
            <span aria-hidden="true">{ICON[check.status]}</span> {WORD[check.status]}
          </span>
          <span className={styles.checkLabel}>{check.label}</span>
          <span className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.checkBody}>
          <p>{check.reason}</p>
          {check.quotes.length > 0 && (
            <ul className={styles.quotes}>
              {check.quotes.map((q, i) => (
                <li key={i}>
                  <span className={styles.quoteLabel}>{q.label}</span>
                  <q>{q.text}</q>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}

export default function Home() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const missing = useMemo(() => {
    const list: string[] = [];
    if (!form.companyName.trim()) list.push("the company name from the invoice");
    if (!form.bankName.trim()) list.push("the bank account name from the invoice");
    if (`${form.listing} ${form.chat}`.trim().length < 40) list.push("some of what the supplier sent (at least a sentence or two)");
    return list;
  }, [form]);

  // Cycle the progress line while waiting for the model.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setStepIdx((i) => Math.min(i + 1, LOADING_STEPS.length - 1)), 2600);
    return () => clearInterval(id);
  }, [loading]);

  // Bring the answer into view and move focus to it.
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      resultRef.current.focus({ preventScroll: true });
    }
  }, [result]);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length > 0 || loading) return;
    setLoading(true);
    setStepIdx(0);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.report) {
        setError(data?.error ?? "Something went wrong.");
      } else {
        setResult(data as Result);
      }
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const checks = result ? [...result.report.checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]) : [];
  const counts = result
    ? (["red", "amber", "green"] as Status[]).map((s) => ({ s, n: result.report.checks.filter((c) => c.status === s).length }))
    : [];
  const stop = result?.report.checks.find((c) => c.id === "bank_vs_company" && c.status === "red") ?? null;
  const questions = result?.followUpQuestions ?? [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">T</span>
          Trustora
        </div>
        <h1>Check a supplier before you send the deposit.</h1>
        <p className={styles.lead}>
          Paste what they sent you. Trustora compares their names, bank account and details, and shows the exact line behind
          every finding.
        </p>
        <ol className={styles.steps} aria-label="How it works">
          <li><span>1</span> Paste what they sent</li>
          <li><span>2</span> Add the invoice names</li>
          <li><span>3</span> Read the report</li>
        </ol>
      </header>

      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.examples}>
          <span>Try an example:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className={styles.chip} onClick={() => setForm(ex.form)} disabled={loading}>
              {ex.label}
            </button>
          ))}
          {(form.listing || form.chat || form.companyName || form.bankName || form.licence) && (
            <button type="button" className={styles.clear} onClick={() => setForm(EMPTY)} disabled={loading}>
              Clear
            </button>
          )}
        </div>

        <fieldset className={styles.group} disabled={loading}>
          <legend>1. What the supplier sent you</legend>
          <label htmlFor="listing">
            Listing or company page text
            <textarea id="listing" rows={4} value={form.listing} onChange={set("listing")}
              placeholder="Copy the text from their Alibaba page, website or profile" />
          </label>
          <label htmlFor="chat">
            Chat or quote messages
            <textarea id="chat" rows={5} value={form.chat} onChange={set("chat")}
              placeholder="Paste the messages, quote or proforma invoice text they sent you" />
          </label>
        </fieldset>

        <fieldset className={styles.group} disabled={loading}>
          <legend>2. Names on the invoice</legend>
          <div className={styles.row}>
            <label htmlFor="companyName">
              Company name
              <input id="companyName" value={form.companyName} onChange={set("companyName")} autoComplete="off"
                placeholder="As written at the top of the invoice" />
            </label>
            <label htmlFor="bankName">
              Bank account name
              <input id="bankName" value={form.bankName} onChange={set("bankName")} autoComplete="off"
                placeholder="Name on the account you would pay" />
            </label>
          </div>
          <label htmlFor="licence">
            Business licence number <span className={styles.optional}>optional</span>
            <input id="licence" value={form.licence} onChange={set("licence")} autoComplete="off" />
          </label>
        </fieldset>

        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={loading || missing.length > 0} aria-describedby="need">
            {loading ? <><span className={styles.spinner} aria-hidden="true" /> Checking…</> : "Check supplier"}
          </button>
          <p id="need" className={styles.need} aria-live="polite">
            {loading
              ? LOADING_STEPS[stepIdx]
              : missing.length > 0
                ? `Still needed: ${missing.join("; ")}.`
                : "Takes about 10 to 20 seconds."}
          </p>
        </div>
      </form>

      {error && (
        <div className={styles.error} role="alert" ref={errorRef}>
          <strong>No report was made.</strong>
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className={styles.skeleton} aria-hidden="true">
          <div /><div /><div />
        </div>
      )}

      {result && (
        <section className={styles.report} ref={resultRef} tabIndex={-1} aria-labelledby="verdict-title">
          <div className={`${styles.verdict} ${styles[result.report.overall]}`}>
            <div className={styles.verdictTop}>
              <span className={styles.bigIcon} aria-hidden="true">{ICON[result.report.overall]}</span>
              <div>
                <h2 id="verdict-title">{VERDICT[result.report.overall].title}</h2>
                <p>{VERDICT[result.report.overall].body}</p>
              </div>
            </div>
            <ul className={styles.counts} aria-label="Result counts">
              {counts.filter((c) => c.n > 0).map((c) => (
                <li key={c.s} className={styles[c.s]}>{c.n} {WORD[c.s].toLowerCase()}</li>
              ))}
            </ul>
            {stop && (
              <div className={styles.sideBySide}>
                {stop.quotes.map((q, i) => (
                  <div key={i}>
                    <span className={styles.quoteLabel}>{q.label}</span>
                    <q>{q.text}</q>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className={styles.sectionTitle}>The checks</h3>
            <ul className={styles.checks}>
              {checks.map((c) => <CheckItem key={c.id} check={c} />)}
            </ul>
          </div>

          {(questions.length > 0 || result.report.askFor.length > 0) && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <h3>What to do next</h3>
                {questions.length > 0 && (
                  <CopyButton text={questions.map((q, i) => `${i + 1}. ${q}`).join("\n")} label="Copy all questions" className={styles.copyAll} />
                )}
              </div>
              {result.report.askFor.length > 0 && (
                <p className={styles.askFor}>Ask them for: <strong>{result.report.askFor.join(", ")}</strong>.</p>
              )}
              {questions.length > 0 && (
                <ol className={styles.questions}>
                  {questions.map((q, i) => (
                    <li key={i}>
                      <span>{q}</span>
                      <CopyButton text={q} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          <p className={styles.note}>
            <strong>Based only on what the supplier provided.</strong> Trustora doesn&apos;t check official records, so a
            consistent liar can still pass. Confirm bank details in writing before you pay.
          </p>
          <p className={styles.meta}>
            Took {(result.meta.elapsedMs / 1000).toFixed(1)}s
            {result.meta.droppedUnverified > 0 && ` · ${result.meta.droppedUnverified} unverified quote(s) removed`}
          </p>
        </section>
      )}

      <footer className={styles.footer}>
        Trustora advises. It never approves a payment, and you make the final call.
      </footer>
    </main>
  );
}
