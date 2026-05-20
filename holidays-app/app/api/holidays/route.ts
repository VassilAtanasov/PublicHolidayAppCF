import { NextResponse } from "next/server";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const DEFAULT_MCP_URL = "http://localhost:8787";
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
    const mcpUrl = process.env.MCP_URL || DEFAULT_MCP_URL;

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: "Missing Cloudflare configuration." },
        { status: 500 },
      );
    }

    const formattedDate = formatDate(date);
    const systemPromptWithDate = `${SYSTEM_PROMPT} Today is ${formattedDate}.`;

    // 1. Fetch available tools dynamically from the MCP Server using the tools/list RPC
    let mcpTools: any[] = [];
    try {
      console.log(`Fetching tools from MCP server at: ${mcpUrl}`);
      const listResponse = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list"
        })
      });

      if (listResponse.ok) {
        const listData = await listResponse.json() as { result?: { tools?: any[] } };
        mcpTools = listData.result?.tools || [];
        console.log(`Discovered ${mcpTools.length} tools from MCP Server`);
      } else {
        console.error(`Failed to list tools from MCP server. Status: ${listResponse.status}`);
      }
    } catch (err) {
      console.error("Error communicating with MCP server for tools/list:", err);
    }

    // 2. Map MCP tools to Cloudflare Workers AI function calling parameters
    const tools = mcpTools.map(t => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema
      }
    }));

    const prompt = `Return a plain-text list (no other Markdown). List national public holidays (off work) on ${formattedDate} worldwide. Always put United States holidays first (if any). Verify it is a non-working day in the country. Group by holiday name with countries in parentheses, ordered by popularity. Use the appropriate holiday lookup tools to get verified holiday data when available.`;

    console.log("Holiday prompt:", prompt);
    console.log("Sending initial prompt to Cloudflare Workers AI with tools count:", tools.length);

    // 3. Make initial AI request
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
          tools: tools.length > 0 ? tools : undefined // Only pass tools if listed successfully
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
          arguments: string | object;
        }>;
      };
    };

    const toolCalls = data.result?.tool_calls;

    // 4. Handle tool execution if the AI model wants to use an MCP tool
    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      console.log("Model requested MCP tool call:", toolCall);

      // Parse arguments if they are returned as string
      let parsedArgs = {};
      try {
        parsedArgs = typeof toolCall.arguments === "string"
          ? JSON.parse(toolCall.arguments)
          : (toolCall.arguments || {});
      } catch (err) {
        console.error("Failed to parse tool call arguments:", err);
      }

      console.log(`Executing tool "${toolCall.name}" on MCP server with args:`, parsedArgs);

      // Call the MCP server's tools/call RPC using clean JSON HTTP POST
      let toolResultText = "";
      try {
        const mcpResponse = await fetch(mcpUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: toolCall.name,
              arguments: parsedArgs
            }
          })
        });

        if (mcpResponse.ok) {
          const mcpJson = await mcpResponse.json() as {
            result?: {
              content?: Array<{ type: string; text: string }>;
            };
          };
          toolResultText = mcpJson.result?.content?.map(c => c.text).join("\n") || "No output from tool.";
          console.log("MCP tool execution result:", toolResultText);
        } else {
          const errText = await mcpResponse.text();
          console.error(`MCP Server returned error status (${mcpResponse.status}):`, errText);
          toolResultText = `Error: MCP server failed to execute the tool. Status: ${mcpResponse.status}`;
        }
      } catch (err) {
        console.error("Error communicating with MCP server for tools/call:", err);
        toolResultText = `Error: Could not communicate with the MCP server to run the tool. ${err instanceof Error ? err.message : ""}`;
      }

      // Generate a compliant call ID and format the tool call for the final AI call
      const callId = `call_${toolCall.name}_0`;
      const formattedToolCalls = [
        {
          id: callId,
          type: "function" as const,
          function: {
            name: toolCall.name,
            arguments: typeof toolCall.arguments === "string"
              ? toolCall.arguments
              : JSON.stringify(toolCall.arguments)
          }
        }
      ];

      // Feed tool result back to the model for final answer generation
      const toolResultMessage = {
        role: "tool" as const,
        content: toolResultText,
        tool_call_id: callId
      };

      console.log("Sending tool result back to Cloudflare Workers AI for final response...");

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
              { role: "assistant", content: "", tool_calls: formattedToolCalls },
              toolResultMessage
            ],
          }),
        },
      );

      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        console.error(`AI API Error for final response (${finalResponse.status}):`, errorText);
        // Fall back to initial model response if final prompt fails
        return NextResponse.json({
          source: "model-fallback",
          result: data.result?.response ?? "No results returned."
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

    // No tool calls - use direct model response
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
