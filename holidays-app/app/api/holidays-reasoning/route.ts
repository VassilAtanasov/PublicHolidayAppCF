import { NextResponse } from "next/server";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";
// const MODEL = "@cf/nvidia/nemotron-3-120b-a12b";
// const MODEL = "@cf/openai/gpt-oss-120b";
const SYSTEM_PROMPT =
  "You are a precise world holiday reference. Return only what is asked. No markdown, no extra commentary. No explanations.";

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
    const { date, systemPrompt, userPrompt } = (await request.json()) as {
      date?: string;
      systemPrompt?: string;
      userPrompt?: string;
    };

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
    const finalSystemPrompt = systemPrompt || `${SYSTEM_PROMPT} Today is ${formattedDate}.`;
    const finalUserPrompt = userPrompt || `Return a plain-text list (no other Markdown). List national public holidays (off work) on ${formattedDate} worldwide. Always put United States holidays first (if any). Verify it is a non-working day in the country. Group by holiday name with countries in parentheses, ordered by popularity. Use the appropriate holiday lookup tools to get verified holiday data when available.`;

    console.log("Holiday reasoning prompt:", finalUserPrompt);
    console.log("Sending prompt to Cloudflare Workers AI with Model: ", MODEL);

    const requestPayload = {
      messages: [
        {
          role: "system",
          content: finalSystemPrompt,
        },
        {
          role: "user",
          content: finalUserPrompt,
        },
      ],
      temperature: 0.0,
      top_p: 0.1,
      raw: true  // Enable raw mode to get reasoning content
    };

    // Make AI request with reasoning model
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API Error (${response.status}):`, errorText);
      return NextResponse.json(
        { error: "Failed to fetch from Cloudflare Workers AI", details: errorText },
        { status: 500 },
      );
    }

    const data = (await response.json()) as {
      result?: {
        response?: string;
        reasoning?: string;
        choices?: Array<{
          message?: {
            content?: string;
            reasoning?: string;
            role?: string;
          };
          finish_reason?: string;
          index?: number;
        }>;
      } | string;
      success?: boolean;
      errors?: any[];
    };

    console.log("Raw Cloudflare AI response:", JSON.stringify(data, null, 2));

    // Handle all three response shapes:
    // 1. OpenAI-compatible: result.choices[0].message.{content, reasoning}
    // 2. Flat object:       result.{response, reasoning}
    // 3. Plain string:      result (string)
    let reasoningContent: string | null = null;
    let finalResponse: string = "No results returned.";

    if (typeof data.result === "object" && data.result !== null) {
      const firstChoice = data.result.choices?.[0];
      if (firstChoice?.message) {
        // OpenAI-compatible format
        finalResponse = firstChoice.message.content ?? "No results returned.";
        reasoningContent = firstChoice.message.reasoning ?? null;
      } else {
        // Flat format
        finalResponse = data.result.response ?? "No results returned.";
        reasoningContent = data.result.reasoning ?? null;
      }
    } else if (typeof data.result === "string") {
      // Plain string result — no reasoning block available
      finalResponse = data.result;
    }

    return NextResponse.json({
      source: "reasoning",
      result: finalResponse,
      reasoning: reasoningContent,
      request: requestPayload,
      response: data
    });

  } catch (error) {
    console.error("Error executing POST:", error instanceof Error ? error.stack : error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}