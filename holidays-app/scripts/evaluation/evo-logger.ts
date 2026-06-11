import * as fs from "fs";
import * as path from "path";

export interface EvoScore {
  timestamp: string;
  date: string;
  provider: string;
  model: string;
  scores: {
    accuracy: number;
    completeness: number;
    consistency: number;
    format: number;
    latencyMs: number;
    tokensEstimate: number;
  };
  details: {
    correctHolidays: string[];
    missingHolidays: string[];
    extraHolidays: string[];
    formatIssues: string[];
  };
  rawResponse: string;
}

export interface EvoRun {
  runId: string;
  startTime: string;
  endTime: string;
  scores: EvoScore[];
  summary: {
    averageScores: Record<string, number>;
    bestProvider: string;
    worstProvider: string;
  };
}

const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "evo-scores.jsonl");
const RUNS_FILE = path.join(LOG_DIR, "evo-runs.jsonl");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

export function logEvoScore(score: EvoScore): void {
  ensureLogDir();
  const line = JSON.stringify(score) + "\n";
  fs.appendFileSync(LOG_FILE, line, "utf-8");
}

export function logEvoRun(run: EvoRun): void {
  ensureLogDir();
  const line = JSON.stringify(run) + "\n";
  fs.appendFileSync(RUNS_FILE, line, "utf-8");
}

export function getHistoricalScores(provider?: string, limit: number = 100): EvoScore[] {
  ensureLogDir();
  if (!fs.existsSync(LOG_FILE)) return [];

  const lines = fs.readFileSync(LOG_FILE, "utf-8").split("\n").filter(Boolean);
  let scores: EvoScore[] = lines.map((l) => JSON.parse(l));

  if (provider) {
    scores = scores.filter((s) => s.provider === provider);
  }

  return scores.slice(-limit);
}

export function getHistoricalRuns(limit: number = 50): EvoRun[] {
  ensureLogDir();
  if (!fs.existsSync(RUNS_FILE)) return [];

  const lines = fs.readFileSync(RUNS_FILE, "utf-8").split("\n").filter(Boolean);
  return lines.map((l) => JSON.parse(l)).slice(-limit);
}

export function calculateTrend(provider: string, metric: keyof EvoScore["scores"]): {
  direction: "improving" | "declining" | "stable";
  changePercent: number;
  dataPoints: number;
} {
  const scores = getHistoricalScores(provider, 20);
  if (scores.length < 2) {
    return { direction: "stable", changePercent: 0, dataPoints: scores.length };
  }

  const values = scores.map((s) => s.scores[metric]);
  const recent = values.slice(-5);
  const older = values.slice(0, -5);

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;

  const changePercent = olderAvg === 0 ? 0 : ((recentAvg - olderAvg) / olderAvg) * 100;

  let direction: "improving" | "declining" | "stable" = "stable";
  if (changePercent > 2) direction = "improving";
  else if (changePercent < -2) direction = "declining";

  return { direction, changePercent: Math.round(changePercent * 100) / 100, dataPoints: scores.length };
}
