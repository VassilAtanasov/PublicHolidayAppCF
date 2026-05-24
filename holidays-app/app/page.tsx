"use client";

import { useEffect, useRef, useState } from "react";

function getTodayDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().split("T")[0];
}

export default function Home() {
  const [date, setDate] = useState(getTodayDate);
  const [aiMode, setAiMode] = useState<"lora" | "mcp">("lora");
  const [result, setResult] = useState("");
  const [source, setSource] = useState<"mcp" | "model" | "model-fallback" | "lora" | "">("");
  const [debugPayload, setDebugPayload] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const hasAutoLoaded = useRef(false);

  async function fetchHolidays(selectedDate: string) {
    if (!selectedDate) {
      setError("Choose a date before checking holidays.");
      setResult("");
      setSource("");
      return;
    }

    setLoading(true);
    setError("");
    setResult("");
    setSource("");
    setDebugPayload(null);

    try {
      const response = await fetch(`/api/holidays-${aiMode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date: selectedDate }),
      });

      const data = (await response.json()) as {
        error?: string;
        result?: any;
        source?: "mcp" | "model" | "model-fallback" | "lora";
        debugPayload?: any;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Something went wrong while checking holidays.");
      }

      const resultString = typeof data.result === "object"
        ? JSON.stringify(data.result, null, 2)
        : (data.result ?? "No results returned.");

      setResult(resultString);
      setSource(data.source ?? "");
      setDebugPayload(data.debugPayload || null);
    } catch (error) {
      console.error("Error:", error);
      setError("Could not check holidays right now." + (error instanceof Error ? ` Details: ${error.message}` : ""));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!date || hasAutoLoaded.current) {
      return;
    }

    hasAutoLoaded.current = true;
    void fetchHolidays(date);
  }, [date]);

  function handleSubmit() {
    void fetchHolidays(date);
  }

  function changeDate(days: number) {
    if (!date) return;
    try {
      const current = new Date(`${date}T00:00:00Z`);
      if (isNaN(current.getTime())) return;
      current.setUTCDate(current.getUTCDate() + days);
      const newDateStr = current.toISOString().split("T")[0];
      setDate(newDateStr);
      void fetchHolidays(newDateStr);
    } catch (err) {
      console.error("Failed to navigate date:", err);
    }
  }

  const PRESETS = [
    { label: "New Year 2026", date: "2026-01-01" },
    { label: "US Independence 2026", date: "2026-07-04" },
    { label: "Christmas 2026", date: "2026-12-25" },
    { label: "New Year 2027", date: "2027-01-01" },
  ];

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden font-sans">
      {/* Decorative Aurora glow elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-sky-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full bg-purple-500/5 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-3xl backdrop-blur-md bg-slate-900/60 border border-slate-800/80 rounded-[2.5rem] p-6 md:p-10 shadow-2xl relative z-10 flex flex-col gap-8 transition-all duration-300">

        {/* Header section */}
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              MCP Enabled API
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Llama 3.1 8B Instruct
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            World Public Holidays
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-xl leading-relaxed">
            Instantly query live holiday data via Model Context Protocol or fallback dynamically to AI general knowledge for unsupported dates.
          </p>
        </header>

        {/* Date Selector and Navigation */}
        <section className="bg-slate-950/40 border border-slate-800/50 rounded-3xl p-5 md:p-6 space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label htmlFor="holiday-date-input" className="text-sm font-semibold text-slate-300 tracking-wide uppercase">
                  Choose Reference Date
                </label>
                <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAiMode("lora")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${aiMode === "lora" ? "bg-sky-500 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    LoRA Model
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiMode("mcp")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${aiMode === "mcp" ? "bg-indigo-500 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    MCP Worker
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Previous Day Button */}
                <button
                  id="prev-day-btn"
                  type="button"
                  onClick={() => changeDate(-1)}
                  disabled={loading}
                  className="flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 hover:bg-slate-850 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition"
                  aria-label="Previous Day"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <input
                  id="holiday-date-input"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={loading}
                  className="flex-1 h-12 rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3 text-base text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60"
                />

                {/* Next Day Button */}
                <button
                  id="next-day-btn"
                  type="button"
                  onClick={() => changeDate(1)}
                  disabled={loading}
                  className="flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 hover:bg-slate-850 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition"
                  aria-label="Next Day"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <button
              id="check-holidays-submit"
              type="button"
              onClick={handleSubmit}
              disabled={loading || !date}
              className="h-12 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold px-6 tracking-wide shadow-lg shadow-sky-500/10 hover:shadow-sky-500/20 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none transition-all duration-300"
            >
              {loading ? "Analyzing..." : "Find Holidays"}
            </button>
          </div>

          {/* Quick presets */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Quick Verified Presets
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.date}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setDate(preset.date);
                    void fetchHolidays(preset.date);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${date === preset.date
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                      : "bg-slate-900/80 text-slate-400 border-slate-800/80 hover:text-slate-200 hover:border-slate-700"
                    } disabled:opacity-50 disabled:pointer-events-none`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Dynamic Result Panel */}
        <section className="min-h-60 rounded-3xl bg-slate-950/60 border border-slate-800/50 p-6 flex flex-col gap-4 relative overflow-hidden">
          {/* Header of results showing status / badges */}
          <div className="flex justify-between items-center border-b border-slate-900 pb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <svg className="w-4 h-4 text-sky-400 animate-spin" style={{ display: loading ? "inline-block" : "none" }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {loading ? "Querying AI Model..." : "Query Results"}
            </span>

            {/* Source Badges */}
            {!loading && source ? (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${source === "mcp"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : source === "model"
                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                    : source === "lora"
                      ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${source === "mcp"
                    ? "bg-emerald-400 animate-ping"
                    : source === "model"
                      ? "bg-purple-400"
                      : source === "lora"
                        ? "bg-sky-400"
                        : "bg-amber-400"
                  }`} />
                {source === "mcp"
                  ? "MCP Worker Data Verified"
                  : source === "model"
                    ? "AI Pretrained Knowledge"
                    : source === "lora"
                      ? "LoRA Model Output"
                      : "AI Model Fallback"}
              </span>
            ) : null}
          </div>

          {/* Body Content */}
          <div className="flex-1 flex flex-col justify-center">
            {loading ? (
              <div className="space-y-4 py-4">
                <div className="h-4 bg-slate-900 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-slate-900 rounded animate-pulse w-5/6" />
                <div className="h-4 bg-slate-900 rounded animate-pulse w-2/3" />
                <p className="text-sm text-slate-500 text-center animate-pulse pt-2">
                  Llama is discovering and calling MCP server tools...
                </p>
              </div>
            ) : null}

            {!loading && error ? (
              <div className="flex items-start gap-3 text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4">
                <svg className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="space-y-1">
                  <p className="font-semibold text-sm">Query Execution Failed</p>
                  <p className="text-xs text-rose-300/80 leading-relaxed">{error}</p>
                </div>
              </div>
            ) : null}

            {!loading && !error && result ? (
              <div className="animate-fade-in py-1">
                <pre className="whitespace-pre-wrap font-mono text-sm leading-7 text-slate-350 bg-slate-900/30 p-4 border border-slate-900/80 rounded-2xl overflow-x-auto max-h-[30rem] scrollbar-thin scrollbar-thumb-slate-800">
                  {result}
                </pre>
              </div>
            ) : null}

            {!loading && !error && !result ? (
              <div className="text-center py-8 space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-slate-500">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm text-slate-400 font-medium">
                  No date selected
                </p>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Pick a date above or click one of the verified presets to list public holidays worldwide.
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {/* Debug Panel */}
        {!loading && !error && debugPayload && (
          <section className="bg-slate-950/40 border border-slate-800/50 rounded-3xl p-5 md:p-6 space-y-3">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-600 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Model Request Payload (Debug)
                </h3>
              </summary>
              
              <div className="animate-fade-in mt-4">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-slate-400 bg-slate-900/50 p-4 border border-slate-800/80 rounded-2xl overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 max-h-96">
                  {JSON.stringify(debugPayload, null, 2)}
                </pre>
              </div>
            </details>
          </section>
        )}

        {/* Footer info */}
        <footer className="flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 border-t border-slate-800/40 pt-6 gap-2">
          <span>Standard JSON-RPC 2.0 Client over HTTP</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            MCP Server: Active
          </span>
        </footer>
      </div>
    </main>
  );
}
