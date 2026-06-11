import { GroundTruthEntry } from "./ground-truth";

export interface ScoreResult {
  accuracy: number;
  completeness: number;
  consistency: number;
  format: number;
  details: {
    correctHolidays: string[];
    missingHolidays: string[];
    extraHolidays: string[];
    formatIssues: string[];
  };
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHolidaysFromResponse(response: string): string[] {
  const holidays: string[] = [];
  const lines = response.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^[-*]\s*(.+?)(?:\s*\(|:|$)/);
    if (match) {
      holidays.push(normalize(match[1]));
    }

    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      holidays.push(normalize(boldMatch[1]));
    }
  }

  return [...new Set(holidays)];
}

function extractCountriesFromResponse(response: string): Map<string, string[]> {
  const countryMap = new Map<string, string[]>();
  const lines = response.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    const countryMatch = trimmed.match(/\(([^)]+)\)/);
    if (countryMatch) {
      const countries = countryMatch[1].split(",").map((c) => normalize(c.trim()));
      const holidayMatch = trimmed.match(/^[-*]\s*(.+?)(?:\s*\(|:|$)/);
      if (holidayMatch) {
        countryMap.set(normalize(holidayMatch[1]), countries);
      }
    }
  }

  return countryMap;
}

export function scoreResponse(response: string, groundTruth: GroundTruthEntry): ScoreResult {
  const details = {
    correctHolidays: [] as string[],
    missingHolidays: [] as string[],
    extraHolidays: [] as string[],
    formatIssues: [] as string[],
  };

  const responseHolidays = extractHolidaysFromResponse(response);
  const expectedNames = groundTruth.expectedHolidays.map((h) => normalize(h.name));

  let correctCount = 0;
  for (const expected of expectedNames) {
    const found = responseHolidays.some(
      (r) => r.includes(expected) || expected.includes(r)
    );
    if (found) {
      correctCount++;
      details.correctHolidays.push(expected);
    } else {
      details.missingHolidays.push(expected);
    }
  }

  for (const response of responseHolidays) {
    const isExtra = !expectedNames.some(
      (e) => e.includes(response) || response.includes(e)
    );
    if (isExtra && response.length > 3) {
      details.extraHolidays.push(response);
    }
  }

  const accuracy = expectedNames.length > 0 ? correctCount / expectedNames.length : (responseHolidays.length === 0 ? 1 : 0);

  const completeness = accuracy;

  let formatScore = 1.0;
  if (!response.includes("\n")) formatScore -= 0.3;
  if (response.length > 2000) formatScore -= 0.2;
  if (response.length < 20) formatScore -= 0.5;
  details.formatIssues.push(`Response length: ${response.length} chars`);

  const consistency = accuracy * 0.8 + formatScore * 0.2;

  return {
    accuracy: Math.round(accuracy * 100) / 100,
    completeness: Math.round(completeness * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,
    format: Math.round(formatScore * 100) / 100,
    details,
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
