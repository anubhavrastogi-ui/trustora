"use client";

import { useState } from "react";
import type { Check, Report, Status } from "../lib/types.ts";
import styles from "./page.module.css";

type Result = {
  report: Report;
  followUpQuestions: string[];
  note: string;
  meta: { elapsedMs: number; inputTokens: number; outputTokens: number; droppedUnverified: number };
};

const EXAMPLE = {
  listing:
    "Shenzhen Bright Tech Co., Ltd. Manufacturer of LED lamps, 12 years in business. Factory tour on request. Address: Bao'an District, Shenzhen.",
  chat: "Hi, thanks for your order. Please pay the 30% deposit to the account of Lin Trading Group. Our business licence number is 914403001234567890.",
  companyName: "Shenzhen Bright Tech Co., Ltd.",
  bankName: "Lin Trading Group",
  licence: "",
};

const EXAMPLE_MATCH = {
  listing:
    "Dongguan Sunrise Plastics Co., Ltd. We manufacture phone cases and silicone products in our own 3,000 sqm workshop. Registered address: 18 Industrial Road, Chang'an Town, Dongguan.",
  chat: "Hello! Our unified social credit code is 91441900MA4UXXXXX1. For the proforma invoice, please pay to account name: Dongguan Sunrise Plastics Co., Ltd. MOQ is 500 pieces.",
  companyName: "Dongguan Sunrise Plastics Co., Ltd.",
  bankName: "Dongguan Sunrise Plastics Limited",
  licence: "",
};

const LABEL: Record<Status, string> = { green: "OK", amber: "Check", red: "STOP" };
const ICON: Record<Status, string> = { green: "✓", amber: "!", red: "✕" };

function CheckRow({ check }: { check: Check }) {
  return (
    <li className={`${styles.check} ${styles[check.status]}`}>
      <div className={styles.checkHead}>
        <span className={styles.pill}>
          {ICON[check.status]} {LABEL[check.status]}
        </span>
        <strong>{check.label}</strong>
      </div>
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
    </li>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={styles.copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard not available; the text is still selectable */
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function Home() {
  const [form, setForm] = useState({ listing: "", chat: "", companyName: "", bankName: "", licence: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
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

  const bank = result?.report.checks.find((c) => c.id === "bank_vs_company");
  const stop = bank?.status === "red" ? bank : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Trustora</h1>
        <p>Paste what a supplier sent you. Get a trust report before you pay a deposit.</p>
      </header>

      <form className={styles.form} onSubmit={submit}>
        <label>
          Supplier listing text
          <textarea rows={4} value={form.listing} onChange={set("listing")} placeholder="Paste the product or company listing text" />
        </label>
        <label>
          Chat or quote text
          <textarea rows={5} value={form.chat} onChange={set("chat")} placeholder="Paste the messages or quote the supplier sent you" />
        </label>
        <div className={styles.row}>
          <label>
            Company name on the invoice
            <input value={form.companyName} onChange={set("companyName")} placeholder="As written on the proforma invoice" />
          </label>
          <label>
            Bank account name on the invoice
            <input value={form.bankName} onChange={set("bankName")} placeholder="Name of the account you would pay" />
          </label>
        </div>
        <label>
          Business licence number <span className={styles.optional}>(optional)</span>
          <input value={form.licence} onChange={set("licence")} />
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={loading}>
            {loading ? "Checking…" : "Check supplier"}
          </button>
          <button type="button" className={styles.link} onClick={() => setForm(EXAMPLE)} disabled={loading}>
            Example: bank name doesn&apos;t match
          </button>
          <button type="button" className={styles.link} onClick={() => setForm(EXAMPLE_MATCH)} disabled={loading}>
            Example: details line up
          </button>
        </div>
      </form>

      {error && (
        <div className={styles.error} role="alert">
          <strong>No report was made.</strong> {error}
        </div>
      )}

      {result && (
        <section className={styles.report} aria-live="polite">
          {stop ? (
            <div className={styles.stop}>
              <h2>✕ STOP: bank account name doesn&apos;t match the company</h2>
              <p>Don&apos;t pay a deposit until the supplier explains this in writing.</p>
              <div className={styles.sideBySide}>
                {stop.quotes.map((q, i) => (
                  <div key={i}>
                    <span className={styles.quoteLabel}>{q.label}</span>
                    <q>{q.text}</q>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={`${styles.overall} ${styles[result.report.overall]}`}>
              <h2>
                {ICON[result.report.overall]} Overall: {LABEL[result.report.overall]}
              </h2>
              <p>This is the worst result of the checks below. Trustora advises; you decide.</p>
            </div>
          )}

          <ul className={styles.checks}>
            {result.report.checks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </ul>

          {result.report.askFor.length > 0 && (
            <div className={styles.card}>
              <h3>Ask the supplier for</h3>
              <ul>
                {result.report.askFor.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {result.followUpQuestions.length > 0 && (
            <div className={styles.card}>
              <h3>Questions to send</h3>
              <ul className={styles.questions}>
                {result.followUpQuestions.map((q, i) => (
                  <li key={i}>
                    <span>{q}</span>
                    <CopyButton text={q} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className={styles.note}>
            <strong>Based only on what the supplier provided.</strong> Trustora doesn&apos;t check official records, so a
            consistent liar can still pass. Confirm bank details in writing before you pay.
          </p>
          <p className={styles.meta}>
            Took {(result.meta.elapsedMs / 1000).toFixed(1)}s · {result.meta.inputTokens + result.meta.outputTokens} tokens
            {result.meta.droppedUnverified > 0 && ` · ${result.meta.droppedUnverified} unverified quote(s) removed`}
          </p>
        </section>
      )}
    </main>
  );
}
