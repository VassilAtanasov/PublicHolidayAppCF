import { NextResponse } from "next/server";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const MCP_URL = "https://e4840d83-80eb-404a-a27b-de6d313f45b4.search.ai.cloudflare.com/mcp";
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
    const systemPromptWithDate = `${SYSTEM_PROMPT} Today is ${formattedDate}.`;

    const prompt = `Return a plain-text list (no other Markdown). List national public holidays (off work) on ${formattedDate} worldwide. Always put United States holidays first (if any). Verify it is a non-working day in the country. Group by holiday name with countries in parentheses, ordered by popularity. Use the search tool to get verified holiday data when available.`;

    // Define MCP tool for the model to use
    const tools = [
      {
        type: "function",
        function: {
          name: "search",
          description: "Search for public holidays using the AI Search index. Use when you need verified holiday data from the indexed content.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query for holidays" }
            },
            required: ["query"]
          }
        }
      }
    ];
    console.log("Holiday prompt:", prompt);

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
              content: systemPromptWithDate,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          tools
        }),
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
        tool_calls?: Array<{
          name: string;
          arguments: string;
        }>;
      };
    };

    // Check if model wants to use MCP tool
    const toolCalls = data.result?.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      console.log("Model requested MCP tool:", toolCalls);

      // Model decided to use MCP - call the MCP endpoint
      const mcpResponse = await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "search",
            arguments: {
              query: `public holidays on ${formattedDate}`
            }
          }
        })
      });

      if (!mcpResponse.ok) {
        // Fall back to model response if MCP fails
        const modelResponse = data.result?.response;
        return NextResponse.json({
          source: "model",
          result: modelResponse ?? "No results returned."
        });
      }

      // MCP returns SSE format, need to parse it
      const mcpText = await mcpResponse.text();
      console.log("MCP raw response:", mcpText);

      // Parse SSE format: "data: {...}\n\n"
      const lines = mcpText.split('\n');
      let mcpData = null;
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            mcpData = JSON.parse(line.slice(6));
            break;
          } catch {
            // Continue looking for valid JSON
          }
        }
      }

      if (!mcpData) {
        // Fall back to model response if MCP parsing fails
        const modelResponse = data.result?.response;
        return NextResponse.json({
          source: "model",
          result: modelResponse ?? "No results returned."
        });
      }

      console.log("MCP parsed response:", mcpData);

      // Send MCP result back to model for processing (proper tool calling flow)
      const toolResultMessage = {
        role: "tool" as const,
        content: JSON.stringify(mcpData),
        tool_call_id: toolCalls[0].name
      };

      const finalResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemPromptWithDate },
              { role: "user", content: prompt },
              { role: "assistant", content: null, tool_calls: toolCalls },
              toolResultMessage
            ],
          }),
        },
      );

      console.log("Final Response status:", finalResponse.status);
      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        console.error(`AI API Error for final response (${finalResponse.status}):`, errorText);
        const modelResponse = data.result?.response;
        return NextResponse.json({
          source: "model",
          result: modelResponse ?? "No results returned."
        });
      }

      const finalData = (await finalResponse.json()) as {
        result?: { response?: string };
      };

      return NextResponse.json({
        source: "mcp",
        result: finalData.result?.response ?? "No results returned."
      });
    }

    // No tool call - use direct model response
    const modelResponse = data.result?.response;
    return NextResponse.json({
      source: "model",
      result: modelResponse ?? "No results returned."
    });
  } catch (error) {
    console.error("Error executing POST:", error instanceof Error ? error.stack : error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}