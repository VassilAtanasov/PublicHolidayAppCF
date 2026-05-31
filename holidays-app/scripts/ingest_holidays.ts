import fs from "fs";
import path from "path";

// Cloudflare AI API credentials from environment
const ACCOUNT_ID = process.env.CLOUDFLARE_WORKERS_AI_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_WORKERS_AI_API_TOKEN;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("Missing CLOUDFLARE_WORKERS_AI_ACCOUNT_ID or CLOUDFLARE_WORKERS_AI_API_TOKEN in environment.");
  process.exit(1);
}

const API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/baai/bge-base-en-v1.5`;

interface HolidayItem {
  d: string; // YYYY-MM-DD
  h: string; // Holiday Name
  c: string[]; // Countries
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: texts })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as any;
  return data.result.data; // Array of arrays of numbers
}

async function processHolidays() {
  const years = ["2026", "2027"];
  const allHolidays: HolidayItem[] = [];

  for (const year of years) {
    const filePath = path.join(__dirname, `../../../PublicHolidaysMCP/PublicHolidays${year}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    allHolidays.push(...data);
  }

  console.log(`Loaded ${allHolidays.length} holidays.`);

  const batchSize = 50; // Cloudflare AI bulk embedding limit might be ~50-100
  const outputStream = fs.createWriteStream(path.join(__dirname, "../holidays-vectors.ndjson"));

  for (let i = 0; i < allHolidays.length; i += batchSize) {
    const batch = allHolidays.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(allHolidays.length / batchSize)}...`);

    const textsToEmbed = batch.map(h => {
      // Create a rich semantic string
      return `${h.h} is a public holiday celebrated in ${h.c.join(", ")}. It is observed on ${new Date(h.d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`;
    });

    try {
      const embeddings = await getEmbeddings(textsToEmbed);

      for (let j = 0; j < batch.length; j++) {
        const h = batch[j];
        const timestamp = Math.floor(new Date(h.d).getTime() / 1000);
        const baseId = `${h.d}-${h.h.replace(/[^a-zA-Z0-9]/g, "-")}`.substring(0, 50);

        for (const country of h.c) {
          const id = `${baseId}-${country.replace(/[^a-zA-Z0-9]/g, "-")}`.substring(0, 64);
          const vectorizeRecord = {
            id: id,
            values: embeddings[j],
            metadata: {
              date: h.d,
              timestamp: timestamp,
              country: country
            }
          };
          outputStream.write(JSON.stringify(vectorizeRecord) + "\n");
        }
      }
    } catch (e) {
      console.error("Error processing batch:", e);
    }
  }

  outputStream.end();
  console.log("Finished generating holidays-vectors.ndjson");
}

processHolidays().catch(console.error);
