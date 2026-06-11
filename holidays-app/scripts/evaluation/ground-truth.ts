export interface GroundTruthEntry {
  date: string;
  year: number;
  expectedHolidays: ExpectedHoliday[];
  tags: string[];
}

export interface ExpectedHoliday {
  name: string;
  countries: string[];
  type: "national" | "regional" | "religious";
  verified: boolean;
}

export const GROUND_TRUTH: GroundTruthEntry[] = [
  {
    date: "2026-01-01",
    year: 2026,
    tags: ["new-year", "global"],
    expectedHolidays: [
      { name: "New Year's Day", countries: ["United States", "United Kingdom", "Germany", "France", "Italy", "Japan", "Australia", "Canada", "Brazil", "India"], type: "national", verified: true },
      { name: "Bank Holiday", countries: ["United Kingdom"], type: "national", verified: true },
    ],
  },
  {
    date: "2026-07-04",
    year: 2026,
    tags: ["independence-day", "us-only"],
    expectedHolidays: [
      { name: "Independence Day", countries: ["United States"], type: "national", verified: true },
    ],
  },
  {
    date: "2026-12-25",
    year: 2026,
    tags: ["christmas", "global"],
    expectedHolidays: [
      { name: "Christmas Day", countries: ["United States", "United Kingdom", "Germany", "France", "Italy", "Japan", "Australia", "Canada", "Brazil"], type: "national", verified: true },
    ],
  },
  {
    date: "2026-10-31",
    year: 2026,
    tags: ["halloween", "mixed"],
    expectedHolidays: [
      { name: "Halloween", countries: ["United States"], type: "national", verified: false },
      { name: "Reformation Day", countries: ["Germany"], type: "national", verified: true },
    ],
  },
  {
    date: "2026-06-19",
    year: 2026,
    tags: ["juneteenth", "us-only"],
    expectedHolidays: [
      { name: "Juneteenth", countries: ["United States"], type: "national", verified: true },
    ],
  },
  {
    date: "2026-05-01",
    year: 2026,
    tags: ["labor-day", "international"],
    expectedHolidays: [
      { name: "International Workers' Day", countries: ["Germany", "France", "Italy", "Brazil"], type: "national", verified: true },
    ],
  },
  {
    date: "2026-01-26",
    year: 2026,
    tags: ["republic-day", "india"],
    expectedHolidays: [
      { name: "Republic Day", countries: ["India"], type: "national", verified: true },
    ],
  },
  {
    date: "2026-03-17",
    year: 2026,
    tags: ["st-patricks", "ireland"],
    expectedHolidays: [
      { name: "St. Patrick's Day", countries: ["Ireland"], type: "national", verified: true },
    ],
  },
  {
    date: "2026-08-15",
    year: 2026,
    tags: ["assumption", "catholic"],
    expectedHolidays: [
      { name: "Assumption of Mary", countries: ["Italy", "France", "Germany"], type: "religious", verified: true },
    ],
  },
  {
    date: "2026-11-11",
    year: 2026,
    tags: ["veterans-day", "armistice"],
    expectedHolidays: [
      { name: "Veterans Day", countries: ["United States"], type: "national", verified: true },
      { name: "Armistice Day", countries: ["France"], type: "national", verified: true },
    ],
  },
];

export function getGroundTruthByDate(date: string): GroundTruthEntry | undefined {
  return GROUND_TRUTH.find((g) => g.date === date);
}

export function getAllTestDates(): string[] {
  return GROUND_TRUTH.map((g) => g.date);
}
