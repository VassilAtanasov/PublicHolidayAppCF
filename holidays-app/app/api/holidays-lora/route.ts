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
  "You are a precise world holiday reference database. Return ONLY the requested holiday information in clean Markdown format.";

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
    const finalSystemPrompt = systemPrompt || SYSTEM_PROMPT;
    const finalUserPrompt = userPrompt || `List all public holidays observed worldwide on ${formattedDate}.`;

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
      lora: "49116681-3912-4837-b646-c5d13dec1a44",
      temperature: 0.1,
      top_p: 0.1,
      stream: true, // Enable streaming
      max_tokens: 800 // Limit generation to prevent CF timeouts
    };

    // Run the processing in the background asynchronously
    void (async () => {
      try {
        // Stream the raw request payload to client
        await writeEvent("request", { request: requestPayload });

        // Make AI request with LoRA
        const cfResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestPayload),
            signal: AbortSignal.timeout(300000), // 5 minute local timeout
          },
        );

        if (!cfResponse.ok) {
          const errorText = await cfResponse.text();
          console.error(`AI API Error (${cfResponse.status}):`, errorText);
          await writeError(`Failed to fetch from Cloudflare Workers AI: ${errorText}`);
          return;
        }

        // Start streaming asynchronously
        await streamCloudflareAiResponse(cfResponse, writeEvent);
        await close();
      } catch (err) {
        console.error("Streaming error:", err);
        await writeError(err instanceof Error ? err.message : String(err));
      }
    })();

    return response;

  } catch (error) {
    console.error("Error executing POST:", error instanceof Error ? error.stack : error);
    await writeError("Failed to process request");
    return response;
  }
}

