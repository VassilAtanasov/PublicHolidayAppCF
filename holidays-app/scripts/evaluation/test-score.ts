import { scoreResponse } from "./scorer";
import { GROUND_TRUTH } from "./ground-truth";

const mockResponses: Record<string, string> = {
  "2026-01-01": `- New Year's Day (United States, United Kingdom, Germany, France)
- Bank Holiday (United Kingdom)
- Winter Festival (Japan)`,

  "2026-07-04": `- Independence Day (United States)`,
};

function runTestScores(): void {
  console.log("=== Testing Scoring Logic ===\n");

  for (const [date, response] of Object.entries(mockResponses)) {
    const groundTruth = GROUND_TRUTH.find((g) => g.date === date);
    if (!groundTruth) continue;

    console.log(`Date: ${date}`);
    console.log(`Response: ${response.substring(0, 100)}...`);

    const result = scoreResponse(response, groundTruth);

    console.log(`Scores:`);
    console.log(`  Accuracy: ${result.accuracy * 100}%`);
    console.log(`  Completeness: ${result.completeness * 100}%`);
    console.log(`  Format: ${result.format * 100}%`);
    console.log(`\nDetails:`);
    console.log(`  Correct: ${result.details.correctHolidays.join(", ") || "none"}`);
    console.log(`  Missing: ${result.details.missingHolidays.join(", ") || "none"}`);
    console.log(`  Extra: ${result.details.extraHolidays.join(", ") || "none"}`);
    console.log("\n---\n");
  }

  console.log("Scoring logic test complete!");
}

if (require.main === module) {
  runTestScores();
}
