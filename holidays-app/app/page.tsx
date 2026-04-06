"use client";

import { useEffect, useState } from "react";

function getTodayDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().split("T")[0];
}

function formatDisplayDate(date: string) {
  if (!date) {
    return "the selected date";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export default function Home() {
  const [date, setDate] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDate(getTodayDate());
  }, []);

  const formattedDate = formatDisplayDate(date);

  async function handleSubmit() {
    if (!date) {
      setError("Choose a date before checking holidays.");
      setResult("");
      return;
    }

    setLoading(true);
    setError("");
    setResult("");

    try {
      const response = await fetch("/api/holidays", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date }),
      });

      const data = (await response.json()) as { error?: string; result?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Something went wrong while checking holidays.");
      }

      setResult(data.result ?? "No results returned.");
    } catch {
      setError("Could not check holidays right now. Verify your Cloudflare credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-16 text-slate-900">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700">
            Cloudflare Workers AI
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
            World Public Holidays
          </h1>
          <p className="text-base text-slate-600">
            See which countries are off work on any date.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium text-slate-700">
            Date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            />
          </label>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !date}
            className="rounded-2xl bg-sky-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? "Checking..." : "Check holidays"}
          </button>
        </div>

        <div className="mt-8 min-h-52 rounded-2xl bg-gray-50 p-5">
          {loading ? (
            <p className="text-sm text-slate-600">Checking holidays for {formattedDate}...</p>
          ) : null}

          {!loading && error ? (
            <p className="text-sm text-rose-700">{error}</p>
          ) : null}

          {!loading && !error && result ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-800">
              {result}
            </pre>
          ) : null}

          {!loading && !error && !result ? (
            <p className="text-sm text-slate-500">
              Pick a date and the app will list national public holidays worldwide.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
