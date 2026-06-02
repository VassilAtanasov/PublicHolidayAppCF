"use client";

import { useEffect, useRef, useState } from "react";

function getTodayDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().split("T")[0];
}

function formatDate(date: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  } catch (err) {
    return date;
  }
}

// MarkdownRenderer is a lightweight utility component to render standard Markdown (headings, bold, bullets, list numbers, blockquotes) natively.
function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split("\n");

  return (
    <div className="space-y-3 text-slate-350 font-sans text-sm leading-relaxed text-left">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // 1. Headings (### or ## or #)
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="text-base font-bold text-teal-400 mt-4 mb-2 tracking-wide uppercase">
              {renderInlineStyles(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} className="text-lg font-bold text-sky-400 mt-5 mb-2 border-b border-slate-900 pb-1">
              {renderInlineStyles(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={idx} className="text-xl font-extrabold text-white mt-6 mb-3 bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
              {renderInlineStyles(trimmed.slice(2))}
            </h2>
          );
        }

        // 2. Unordered lists (- or * or •)
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1 my-1">
              <li className="text-slate-350">
                {renderInlineStyles(trimmed.slice(2))}
              </li>
            </ul>
          );
        }

        // 3. Numbered lists (e.g. 1. )
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          return (
            <ol key={idx} className="list-decimal pl-5 space-y-1 my-1" start={parseInt(numMatch[1])}>
              <li className="text-slate-350">
                {renderInlineStyles(numMatch[2])}
              </li>
            </ol>
          );
        }

        // 4. Blockquotes
        if (trimmed.startsWith("> ")) {
          return (
            <blockquote key={idx} className="border-l-4 border-teal-500 pl-4 py-1 my-2 bg-slate-950/40 rounded-r-xl italic text-slate-400">
              {renderInlineStyles(trimmed.slice(2))}
            </blockquote>
          );
        }

        // 5. Empty line
        if (trimmed === "") {
          return <div key={idx} className="h-2" />;
        }

        // 6. Regular paragraph
        return (
          <p key={idx} className="text-slate-350 my-1">
            {renderInlineStyles(line)}
          </p>
        );
      })}
    </div>
  );
}

function renderInlineStyles(text: string) {
  if (!text) return "";

  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx} className="font-bold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={idx} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300 font-mono text-xs">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function buildSystemPrompt(formattedDate: string, modeSuffix?: string): string {
  const basePrompt = `You are a precise world holiday reference database. Return ONLY the requested holiday information in clean Markdown format. Never add introductions, conclusions, disclaimers, or any commentary.

RULES:
1. List national public holidays (official non-working days) for the specified date worldwide
2. Always list United States holidays first (if any exist for the date)
3. Group holidays by name, then list affected countries as bullet points under each holiday
4. Within each holiday group, order countries by population (largest first)
5. For holidays unique to one country, list the holiday name with the country as a single bullet
6. Do not hallucinate! If no national public holidays exist for the date, return exactly: "No national public holidays found for this date."
7. Use this format:

## [Holiday Name]
- Country A
- Country B

## [Another Holiday]
- Country C

Today is ${formattedDate}.`;

  if (modeSuffix) {
    return `${basePrompt} ${modeSuffix}`;
  }

  return basePrompt;
}

export default function Home() {
  const [date, setDate] = useState(getTodayDate);
  const [aiMode, setAiMode] = useState<"base" | "lora" | "mcp" | "rag">("base");
  const [result, setResult] = useState("");
  const [source, setSource] = useState<"mcp" | "model" | "model-fallback" | "lora" | "base" | "rag" | "">("");

  // Prompts states
  const [systemPrompt, setSystemPrompt] = useState(() => {
    const formatted = formatDate(getTodayDate());
    return buildSystemPrompt(formatted);
  });
  const [userPrompt, setUserPrompt] = useState(() => {
    const formatted = formatDate(getTodayDate());
    return `List national public holidays (off work) on ${formatted} worldwide.`;
  });

  const [systemPrompts, setSystemPrompts] = useState<Record<"base" | "lora" | "mcp" | "rag", string>>(() => {
    const formatted = formatDate(getTodayDate());
    return {
      base: buildSystemPrompt(formatted),
      lora: buildSystemPrompt(formatted),
      mcp: buildSystemPrompt(formatted),
      rag: buildSystemPrompt(formatted),
    };
  });

  const [executionCache, setExecutionCache] = useState<Record<"base" | "lora" | "mcp" | "rag", {
    result: string;
    source: "mcp" | "model" | "model-fallback" | "lora" | "base" | "rag" | "";
    rawRequest: any;
    rawResponse: any;
    error: string;
  }>>({
    base: { result: "", source: "", rawRequest: null, rawResponse: null, error: "" },
    lora: { result: "", source: "", rawRequest: null, rawResponse: null, error: "" },
    mcp: { result: "", source: "", rawRequest: null, rawResponse: null, error: "" },
    rag: { result: "", source: "", rawRequest: null, rawResponse: null, error: "" },
  });

  const [rawRequest, setRawRequest] = useState<any>(null);
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const hasAutoLoaded = useRef(false);

  function updatePromptsForDate(prevDateStr: string, newDateStr: string) {
    const prevFormatted = formatDate(prevDateStr);
    const newFormatted = formatDate(newDateStr);

    // Update the system prompts cache for each mode
    setSystemPrompts(prevMap => {
      const nextMap = { ...prevMap };
      for (const mode of Object.keys(nextMap) as Array<keyof typeof nextMap>) {
        nextMap[mode] = nextMap[mode].replaceAll(prevFormatted, newFormatted);
      }
      return nextMap;
    });

    // Update the active system prompt
    setSystemPrompt(prev => prev.replaceAll(prevFormatted, newFormatted));

    // Update the shared user prompt
    setUserPrompt(prev => prev.replaceAll(prevFormatted, newFormatted));
  }

  function handleAiModeChange(newMode: "base" | "lora" | "mcp" | "rag") {
    // 1. Save current active system prompt & execution details into the cache of the OLD mode
    setSystemPrompts(prev => ({
      ...prev,
      [aiMode]: systemPrompt
    }));

    setExecutionCache(prev => ({
      ...prev,
      [aiMode]: { result, source, rawRequest, rawResponse, error }
    }));

    // 2. Load system prompt & execution details from the cache of the NEW mode
    setAiMode(newMode);
    setSystemPrompt(systemPrompts[newMode]);

    const cached = executionCache[newMode];
    setResult(cached.result);
    setSource(cached.source);
    setRawRequest(cached.rawRequest);
    setRawResponse(cached.rawResponse);
    setError(cached.error);
  }

  async function fetchHolidays(
    selectedDate: string,
    customSystemPrompt?: string,
    customUserPrompt?: string
  ) {
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
    setRawRequest(null);
    setRawResponse(null);

    const payload = {
      date: selectedDate,
      systemPrompt: customSystemPrompt ?? systemPrompt,
      userPrompt: customUserPrompt ?? userPrompt,
    };

    try {
      const response = await fetch(`/api/holidays-${aiMode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch (err) {
        console.error("Failed to parse JSON response:", err);
      }

      if (data) {
        setRawRequest(data.request || payload);
        setRawResponse(data.response || data);
      } else {
        setRawRequest(payload);
      }

      if (!response.ok) {
        throw new Error(data?.error ?? `HTTP ${response.status}: Something went wrong while checking holidays.`);
      }

      const resultString = typeof data.result === "object"
        ? JSON.stringify(data.result, null, 2)
        : (data.result ?? "No results returned.");

      setResult(resultString);
      setSource(data.source ?? "");

      // Cache this execution
      setExecutionCache(prev => ({
        ...prev,
        [aiMode]: {
          result: resultString,
          source: data.source ?? "",
          rawRequest: data.request || payload,
          rawResponse: data.response || data,
          error: ""
        }
      }));

    } catch (error) {
      console.error("Error:", error);
      const errMessage = "Could not check holidays right now." + (error instanceof Error ? ` Details: ${error.message}` : "");
      setError(errMessage);

      // Cache this error
      setExecutionCache(prev => ({
        ...prev,
        [aiMode]: {
          result: "",
          source: "",
          rawRequest: payload,
          rawResponse: null,
          error: errMessage
        }
      }));
    } finally {
      setLoading(false);
    }
  }

  function handleDateChange(newDate: string) {
    if (!newDate) return;
    updatePromptsForDate(date, newDate);
    setDate(newDate);
  }

  function handleSubmit() {
    void fetchHolidays(date, systemPrompt, userPrompt);
  }

  function changeDate(days: number) {
    if (!date) return;
    try {
      const current = new Date(`${date}T00:00:00Z`);
      if (isNaN(current.getTime())) return;
      current.setUTCDate(current.getUTCDate() + days);
      const newDateStr = current.toISOString().split("T")[0];

      updatePromptsForDate(date, newDateStr);
      setDate(newDateStr);
    } catch (err) {
      console.error("Failed to navigate date:", err);
    }
  }

  function handlePresetClick(presetDate: string) {
    updatePromptsForDate(date, presetDate);
    setDate(presetDate);
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

      <div className="w-full max-w-3xl lg:max-w-none lg:w-[90%] xl:w-[95%] backdrop-blur-md bg-slate-900/60 border border-slate-800/80 rounded-[2.5rem] p-6 md:p-10 shadow-2xl relative z-10 flex flex-col gap-8 transition-all duration-300">

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
                    onClick={() => handleAiModeChange("base")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${aiMode === "base" ? "bg-slate-500 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Base Model
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiModeChange("lora")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${aiMode === "lora" ? "bg-sky-500 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    LoRA Model
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiModeChange("mcp")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${aiMode === "mcp" ? "bg-indigo-500 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    MCP Worker
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiModeChange("rag")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${aiMode === "rag" ? "bg-teal-500 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    RAG Search
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Previous Day Button */}
                <button
                  id="prev-day-btn"
                  type="button"
                  onClick={() => changeDate(-1)}
                  disabled={loading || aiMode === "rag"}
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
                  onChange={(event) => handleDateChange(event.target.value)}
                  disabled={loading || aiMode === "rag"}
                  className="flex-1 h-12 rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3 text-base text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60 disabled:pointer-events-none"
                />

                {/* Next Day Button */}
                <button
                  id="next-day-btn"
                  type="button"
                  onClick={() => changeDate(1)}
                  disabled={loading || aiMode === "rag"}
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
                  onClick={() => handlePresetClick(preset.date)}
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

        {/* Prompts Configuration Section (Editable) */}
        <section className="bg-slate-950/40 border border-slate-800/50 rounded-3xl p-5 md:p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <svg className="w-4.5 h-4.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Prompts Configuration (Editable)
          </h3>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="system-prompt-textarea" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                System Prompt
              </label>
              <textarea
                id="system-prompt-textarea"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                disabled={loading}
                className="w-full min-h-24 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 text-xs font-mono leading-relaxed text-slate-200 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60"
                placeholder="Enter custom system prompt..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="user-prompt-textarea" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                User Prompt
              </label>
              <textarea
                id="user-prompt-textarea"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                disabled={loading}
                className="w-full min-h-32 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 text-xs font-mono leading-relaxed text-slate-200 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60"
                placeholder="Enter custom user prompt..."
              />
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
                : source === "model" || source === "base"
                  ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                  : source === "lora"
                    ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                    : source === "rag"
                      ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${source === "mcp"
                  ? "bg-emerald-400 animate-ping"
                  : source === "model" || source === "base"
                    ? "bg-purple-400"
                    : source === "lora"
                      ? "bg-sky-400"
                      : source === "rag"
                        ? "bg-teal-400"
                        : "bg-amber-400"
                  }`} />
                {source === "mcp"
                  ? "MCP Worker Data Verified"
                  : source === "model" || source === "base"
                    ? "AI Pretrained Knowledge"
                    : source === "lora"
                      ? "LoRA Model Output"
                      : source === "rag"
                        ? "Vector-RAG Knowledge"
                        : "AI Model Fallback"}
              </span>
            ) : null}
          </div>

          <div className="flex-1 flex flex-col justify-center">
            {loading ? (
              <div className="space-y-4 py-4">
                <div className="h-4 bg-slate-900 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-slate-900 rounded animate-pulse w-5/6" />
                <div className="h-4 bg-slate-900 rounded animate-pulse w-2/3" />
                <p className="text-sm text-slate-500 text-center animate-pulse pt-2">
                  LLM model processing your query...
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
                <div className="text-slate-350 bg-slate-900/30 p-6 border border-slate-900/80 rounded-3xl overflow-x-auto max-h-[30rem] scrollbar-thin scrollbar-thumb-slate-800 shadow-inner">
                  <MarkdownRenderer content={result} />
                </div>
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

        {/* Raw Request & Response JSONs (Debug) */}
        {!loading && (rawRequest || rawResponse) && (() => {
          const toolMessage = rawRequest?.messages?.find((m: any) => m.role === "tool");
          const toolResponseContent = toolMessage?.content;
          const isRagMode = aiMode === "rag";
          const ragMetadata = rawResponse?.extracted_metadata;
          const ragVectorResults = rawResponse?.vector_search_results;
          const hasRagDetails = isRagMode && (ragMetadata || ragVectorResults);
          const showThirdColumn = toolResponseContent || hasRagDetails;

          return (
            <section className="w-full bg-slate-950/40 border border-slate-800/50 rounded-3xl p-5 md:p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4.5 h-4.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Raw Model Request, Tool Execution & Response Debugger
              </h3>

              <div className={`grid grid-cols-1 ${showThirdColumn ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-6`}>
                {/* Request JSON */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Raw Request JSON
                  </label>
                  <pre
                    id="raw-request-json"
                    className="w-full h-80 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-xs font-mono leading-relaxed text-slate-350 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
                  >
                    {rawRequest ? JSON.stringify(rawRequest, null, 2) : "No request payload"}
                  </pre>
                </div>

                {/* Tool Response Column (only if tool response exists) */}
                {toolResponseContent && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                      MCP Tool Response Output
                    </label>
                    <pre
                      id="mcp-tool-response"
                      className="w-full h-80 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-xs font-mono leading-relaxed text-emerald-300 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
                    >
                      {toolResponseContent}
                    </pre>
                  </div>
                )}

                {/* Response JSON */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Raw Response JSON
                  </label>
                  <pre
                    id="raw-response-json"
                    className="w-full h-80 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-xs font-mono leading-relaxed text-slate-350 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
                  >
                    {rawResponse ? JSON.stringify(rawResponse, null, 2) : "No response payload"}
                  </pre>
                </div>

                {/* RAG Search Details Column (only if in RAG mode) */}
                {hasRagDetails && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
                      RAG Vector Matches & Extracted Metadata
                    </label>
                    <div className="w-full h-80 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-xs font-mono leading-relaxed text-slate-350 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent space-y-4">
                      {ragMetadata && (
                        <div>
                          <div className="text-teal-400 font-bold mb-1">// Extracted Search Criteria</div>
                          <pre className="text-slate-300 whitespace-pre-wrap">{JSON.stringify(ragMetadata, null, 2)}</pre>
                        </div>
                      )}
                      {ragVectorResults && ragVectorResults.length > 0 && (
                        <div>
                          <div className="text-teal-400 font-bold mb-1">// Vector search matched documents ({ragVectorResults.length})</div>
                          <div className="space-y-2 mt-2">
                            {ragVectorResults.map((m: any, idx: number) => (
                              <div key={m.id || idx} className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80">
                                <div className="text-slate-200 font-semibold truncate" title={m.id}>{m.id}</div>
                                <div className="flex justify-between text-[10px] mt-1 text-slate-500">
                                  <span>Score: {m.score?.toFixed(4)}</span>
                                  {m.metadata?.date && <span>Date: {m.metadata.date}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })()}

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
