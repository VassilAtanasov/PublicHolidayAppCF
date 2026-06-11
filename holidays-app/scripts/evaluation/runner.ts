import { GROUND_TRUTH, getGroundTruthByDate } from "./ground-truth";
import { scoreResponse, estimateTokens } from "./scorer";
import { logEvoScore, logEvoRun, EvoScore, EvoRun } from "./evo-logger";

const API_ENDPOINTS = [
  { name: "base", url: "http://localhost:3000/api/holidays-base", model: "@cf/google/gemma-7b-it-lora" },
  { name: "lora", url: "http://localhost:3000/api/holidays-lora", model: "@cf/google/gemma-7b-it-lora + LoRA" },
  { name: "rag", url: "http://localhost:3000/api/holidays-rag", model: "@cf/meta/llama-3.1-8b-instruct-fp8-fast + RAG" },
  { name: "reasoning", url: "http://localhost:3000/api/holidays-reasoning", model: "@cf/google/gemma-4-26b-a4b-it" },
  { name: "mcp", url: "http://localhost:3000/api/holidays-mcp", model: "@cf/meta/llama-3.1-8b-instruct-fp8-fast + MCP" },
];

async function callApi(endpoint: string, date: string): Promise<{ content: string; latencyMs: number }> {
  const start = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        userPrompt: `Return a plain-text list (no other Markdown). List national public holidays (off work) on ${date} worldwide. Always put United States holidays first (if any). Verify it is a non-working day in the country. Group by holiday name with countries in parentheses, ordered by popularity.`,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let content = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const dataStr = trimmed.slice(6).trim();
        if (dataStr === "[DONE]") break;

        try {
          const data = JSON.parse(dataStr);
          if (data.type === "content" && data.text) {
            content += data.text;
          }
        } catch {}
      }
    }

    return { content, latencyMs: Date.now() - start };
  } catch (error) {
    return { content: "", latencyMs: Date.now() - start };
  }
}

async function runEvaluation(dates?: string[]): Promise<EvoRun> {
  const runId = `run-${Date.now()}`;
  const testDates = dates || GROUND_TRUTH.map((g) => g.date);
  const allScores: EvoScore[] = [];

  console.log(`\n=== Starting Evo Evaluation Run: ${runId} ===`);
  console.log(`Testing ${testDates.length} dates across ${API_ENDPOINTS.length} providers\n`);

  for (const date of testDates) {
    const groundTruth = getGroundTruthByDate(date);
    if (!groundTruth) {
      console.log(`Skipping ${date} - no ground truth`);
      continue;
    }

    console.log(`\n--- Testing date: ${date} ---`);

    for (const endpoint of API_ENDPOINTS) {
      console.log(`  Calling ${endpoint.name}...`);

      const { content, latencyMs } = await callApi(endpoint.url, date);
      const scoreResult = scoreResponse(content, groundTruth);

      const evoScore: EvoScore = {
        timestamp: new Date().toISOString(),
        date,
        provider: endpoint.name,
        model: endpoint.model,
        scores: {
          accuracy: scoreResult.accuracy,
          completeness: scoreResult.completeness,
          consistency: scoreResult.consistency,
          format: scoreResult.format,
          latencyMs,
          tokensEstimate: estimateTokens(content),
        },
        details: scoreResult.details,
        rawResponse: content.substring(0, 1000),
      };

      allScores.push(evoScore);
      logEvoScore(evoScore);

      console.log(`    Accuracy: ${scoreResult.accuracy * 100}% | Latency: ${latencyMs}ms`);
      console.log(`    Correct: ${scoreResult.details.correctHolidays.join(", ") || "none"}`);
      console.log(`    Missing: ${scoreResult.details.missingHolidays.join(", ") || "none"}`);
    }
  }

  const providerScores: Record<string, number[]> = {};
  for (const score of allScores) {
    if (!providerScores[score.provider]) providerScores[score.provider] = [];
    providerScores[score.provider].push(score.scores.accuracy);
  }

  const averageScores: Record<string, number> = {};
  for (const [provider, scores] of Object.entries(providerScores)) {
    averageScores[provider] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const sortedProviders = Object.entries(averageScores).sort((a, b) => b[1] - a[1]);
  const bestProvider = sortedProviders[0]?.[0] || "none";
  const worstProvider = sortedProviders[sortedProviders.length - 1]?.[0] || "none";

  const run: EvoRun = {
    runId,
    startTime: allScores[0]?.timestamp || new Date().toISOString(),
    endTime: new Date().toISOString(),
    scores: allScores,
    summary: {
      averageScores,
      bestProvider,
      worstProvider,
    },
  };

  logEvoRun(run);

  console.log(`\n=== Evaluation Complete ===`);
  console.log(`Best provider: ${bestProvider} (${(averageScores[bestProvider] * 100).toFixed(1)}%)`);
  console.log(`Worst provider: ${worstProvider} (${(averageScores[worstProvider] * 100).toFixed(1)}%)`);

  return run;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dates = args.length > 0 ? args : undefined;

  runEvaluation(dates).then((run) => {
    console.log(`\nRun ID: ${run.runId}`);
    console.log(`Results logged to: ./logs/evo-scores.jsonl`);
  });
}
