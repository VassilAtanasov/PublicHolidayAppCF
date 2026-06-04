import { createSseResponse, streamCloudflareAiResponse } from "../stream-utils";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const MODEL = "@cf/google/gemma-7b-it-lora";
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
  const { response, writeEvent, close, writeError } = createSseResponse();

  // Apply CORS headers to the response object if possible
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  try {
    const { date, systemPrompt, userPrompt } = (await request.json()) as {
      date?: string;
      systemPrompt?: string;
      userPrompt?: string;
    };

    if (!date) {
      await writeError("Date is required.");
      return response;
    }

    const accountId = process.env.CLOUDFLARE_WORKERS_AI_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_WORKERS_AI_API_TOKEN;

    if (!accountId || !apiToken) {
      await writeError("Missing Cloudflare configuration.");
      return response;
    }

    const formattedDate = formatDate(date);
    const finalSystemPrompt = systemPrompt || `${SYSTEM_PROMPT} Today is ${formattedDate}.`;
    const finalUserPrompt = userPrompt || `Return a plain-text list (no other Markdown). List national public holidays (off work) on ${formattedDate} worldwide. Always put United States holidays first (if any). Verify it is a non-working day in the country. Group by holiday name with countries in parentheses, ordered by popularity. Use the appropriate holiday lookup tools to get verified holiday data when available.`;

    console.log("Holiday prompt:", finalUserPrompt);
    console.log("Sending prompt to Cloudflare Workers AI with LoRA (streaming)");

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
      temperature: 0.0, // Force absolute determinism
      top_p: 0.1,
      stream: true // Enable streaming
    };

    // Stream the raw request payload to client
    await writeEvent("request", { request: requestPayload });

    // Make AI request with base model
    const cfResponse = await fetch(
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

    if (!cfResponse.ok) {
      const errorText = await cfResponse.text();
      console.error(`AI API Error (${cfResponse.status}):`, errorText);
      await writeError(`Failed to fetch from Cloudflare Workers AI: ${errorText}`);
      return response;
    }

    // Start streaming asynchronously
    void streamCloudflareAiResponse(cfResponse, writeEvent)
      .then(close)
      .catch(async (err) => {
        console.error("Streaming error:", err);
        await writeError(err instanceof Error ? err.message : String(err));
      });

    return response;

  } catch (error) {
    console.error("Error executing POST:", error instanceof Error ? error.stack : error);
    await writeError("Failed to process request");
    return response;
  }
}

