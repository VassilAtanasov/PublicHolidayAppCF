import { NextResponse } from "next/server";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const SYSTEM_PROMPT =
  "You are a precise world holiday reference. Return only what is asked. No markdown, no extra commentary.";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export async function POST(request: Request) {
  try {
    const { date } = (await request.json()) as { date?: string };

    if (!date) {
      return NextResponse.json({ error: "Date is required." }, { status: 400 });
    }

    const accountId = process.env.CLOUDFLARE_WORKERS_AI_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_WORKERS_AI_API_TOKEN;

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: "Missing Cloudflare configuration." },
        { status: 500 },
      );
    }

    const formattedDate = formatDate(date);
    const prompt = `Return a plain-text list (no other Markdown). List national public holidays (off work) on ${formattedDate} worldwide. Always put United States holidays first (if any). Verify it is a non-working day in the country. Group by holiday name with countries in parentheses, ordered by popularity. No explanations.`;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch from Cloudflare Workers AI" },
        { status: 500 },
      );
    }

    const data = (await response.json()) as {
      result?: {
        response?: string;
      };
    };

    return NextResponse.json({ result: data.result?.response ?? "No results returned." });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch from Cloudflare Workers AI" },
      { status: 500 },
    );
  }
}