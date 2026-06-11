import { getHistoricalScores, getHistoricalRuns, calculateTrend } from "./evo-logger";

function formatTrend(trend: { direction: string; changePercent: number; dataPoints: number }): string {
  const arrow = trend.direction === "improving" ? "↑" : trend.direction === "declining" ? "↓" : "→";
  return `${arrow} ${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}% (${trend.dataPoints} runs)`;
}

function generateReport(): void {
  const runs = getHistoricalRuns(10);
  const providers = ["base", "lora", "rag", "reasoning", "mcp"];

  console.log("\n" + "=".repeat(80));
  console.log("                    EVO SCORE REPORT");
  console.log("=".repeat(80));
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Total runs analyzed: ${runs.length}`);
  console.log("=".repeat(80));

  if (runs.length === 0) {
    console.log("\nNo evaluation runs found. Run the evaluator first:");
    console.log("  npm run evaluate");
    return;
  }

  const latestRun = runs[runs.length - 1];
  console.log("\n--- LATEST RUN SUMMARY ---");
  console.log(`Run ID: ${latestRun.runId}`);
  console.log(`Time: ${latestRun.startTime}`);

  console.log("\n--- PROVIDER ACCURACY (Latest Run) ---");
  for (const [provider, score] of Object.entries(latestRun.summary.averageScores)) {
    const bar = "█".repeat(Math.round(score * 30));
    const padding = " ".repeat(30 - Math.round(score * 30));
    console.log(`${provider.padEnd(12)} ${bar}${padding} ${(score * 100).toFixed(1)}%`);
  }

  console.log("\n--- TRENDS OVER TIME ---");
  for (const provider of providers) {
    const trend = calculateTrend(provider, "accuracy");
    console.log(`${provider.padEnd(12)} ${formatTrend(trend)}`);
  }

  console.log("\n--- PERFORMANCE (Latency) ---");
  for (const provider of providers) {
    const scores = getHistoricalScores(provider, 10);
    if (scores.length === 0) continue;
    const avgLatency = scores.reduce((a, s) => a + s.scores.latencyMs, 0) / scores.length;
    console.log(`${provider.padEnd(12)} ${Math.round(avgLatency)}ms avg`);
  }

  console.log("\n--- HISTORICAL RUNS ---");
  console.log("Run ID".padEnd(25) + "Best".padEnd(12) + "Worst".padEnd(12) + "Accuracy");
  console.log("-".repeat(60));

  for (const run of runs.slice(-5)) {
    const best = run.summary.bestProvider;
    const worst = run.summary.worstProvider;
    const bestScore = run.summary.averageScores[best] || 0;
    console.log(
      run.runId.padEnd(25) +
      best.padEnd(12) +
      worst.padEnd(12) +
      `${(bestScore * 100).toFixed(1)}%`
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log("Files:");
  console.log("  - ./logs/evo-scores.jsonl  (individual scores)");
  console.log("  - ./logs/evo-runs.jsonl    (run summaries)");
  console.log("=".repeat(80) + "\n");
}

if (require.main === module) {
  generateReport();
}

export { generateReport };
