import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: CORS_HEADERS });
}

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
    const { date, systemPrompt, userPrompt } = (await request.json()) as {
      date?: string;
      systemPrompt?: string;
      userPrompt?: string;
    };

    if (!date) {
      return NextResponse.json({ error: "Date is required." }, { status: 400, headers: CORS_HEADERS });
    }

    const accountId = process.env.CLOUDFLARE_WORKERS_AI_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_WORKERS_AI_API_TOKEN;
    const mcpUrl = process.env.MCP_URL || DEFAULT_MCP_URL;

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: "Missing Cloudflare configuration." },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    const formattedDate = formatDate(date);
    const finalSystemPrompt = systemPrompt || `${SYSTEM_PROMPT} Today is ${formattedDate}.`;

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

    const finalUserPrompt = userPrompt || `Return a plain-text list (no other Markdown). List national public holidays (off work) on ${formattedDate} worldwide. Always put United States holidays first (if any). Verify it is a non-working day in the country. Group by holiday name with countries in parentheses, ordered by popularity. Use the appropriate holiday lookup tools to get verified holiday data when available.`;

    console.log("Holiday prompt:", finalUserPrompt);
    console.log("Sending initial prompt to Cloudflare Workers AI with tools count:", tools.length);

    const initialPayload = {
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
      tools: tools.length > 0 ? tools : undefined // Only pass tools if listed successfully
    };

    // 3. Make initial AI request
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initialPayload),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API Error (${response.status}):`, errorText);
      return NextResponse.json(
        { error: "Failed to fetch from Cloudflare Workers AI", details: errorText },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    const data = (await response.json()) as {
      result?: {
        response?: string;
        tool_calls?: Array<{
          id?: string;
          name?: string;
          arguments?: string | object;
          function?: {
            name?: string;
            arguments?: string | object;
          };
        }>;
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: {
                name: string;
                arguments: string;
              };
            }>;
          };
        }>;
      };
    };

    // Extract tool calls from standard choices format or flat result.tool_calls format
    const choiceToolCalls = data.result?.choices?.[0]?.message?.tool_calls;
    const flatToolCalls = data.result?.tool_calls;
    const toolCalls = choiceToolCalls || flatToolCalls;

    // 4. Handle tool execution if the AI model wants to use an MCP tool
    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0] as any;
      console.log("Model requested MCP tool call:", toolCall);

      // Support both flat toolCall (older spec) and nested function toolCall (OpenAI/Llama standard)
      const toolName = toolCall.name || toolCall.function?.name;
      const toolArguments = toolCall.arguments || toolCall.function?.arguments;
      // Extract the exact tool-use identifier generated by Llama, or fallback to a custom one
      const callId = toolCall.id || `call_${toolName}_0`;

      if (!toolName) {
        console.error("Could not find tool name in tool call:", toolCall);
        return NextResponse.json({
          source: "model-fallback",
          result: data.result?.response ?? "No results returned due to invalid tool call.",
          request: initialPayload,
          response: data
        }, { headers: CORS_HEADERS });
      }

      // Parse arguments if they are returned as string
      let parsedArgs = {};
      try {
        parsedArgs = typeof toolArguments === "string"
          ? JSON.parse(toolArguments)
          : (toolArguments || {});
      } catch (err) {
        console.error("Failed to parse tool call arguments:", err);
      }

      console.log(`Executing tool "${toolName}" on MCP server with args:`, parsedArgs);

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
              name: toolName,
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

      // Format the tool call for the final AI call using the exact model-generated ID
      const formattedToolCalls = [
        {
          id: callId,
          type: "function" as const,
          function: {
            name: toolName,
            arguments: typeof toolArguments === "string"
              ? toolArguments
              : JSON.stringify(toolArguments || {})
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

      // Extract the assistant's original response content robustly
      const assistantContent = data.result?.response || data.result?.choices?.[0]?.message?.content || "";

      const finalPayload = {
        messages: [
          { role: "system", content: finalSystemPrompt },
          { role: "user", content: finalUserPrompt },
          { role: "assistant", content: assistantContent, tool_calls: formattedToolCalls },
          toolResultMessage
        ]
      };

      const finalResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(finalPayload),
        },
      );

      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        console.error(`AI API Error for final response (${finalResponse.status}):`, errorText);
        return NextResponse.json({
          source: "model-fallback",
          result: data.result?.response ?? "No results returned.",
          request: finalPayload,
          response: { error: `Final response error: ${errorText}` }
        }, { headers: CORS_HEADERS });
      }

      const finalData = (await finalResponse.json()) as {
        result?: { response?: string };
      };

      const finalResultText = cleanFinalResponse(finalData.result?.response ?? "No results returned.");

      return NextResponse.json({
        source: "mcp",
        result: finalResultText,
        request: finalPayload,
        response: finalData
      }, { headers: CORS_HEADERS });
    }

    // No tool calls - use direct model response
    const modelResponse = data.result?.response || data.result?.choices?.[0]?.message?.content;
    return NextResponse.json({
      source: "model",
      result: modelResponse ?? "No results returned.",
      request: initialPayload,
      response: data
    }, { headers: CORS_HEADERS });

  } catch (error) {
    console.error("Error executing POST:", error instanceof Error ? error.stack : error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

function cleanFinalResponse(text: string): string {
  if (!text) return text;
  // Strip any trailing JSON object representing a tool call (e.g., {"name": ..., "parameters": ...})
  let cleaned = text.replace(/\s*\{"name":\s*"[^"]*",\s*"(?:parameters|arguments)":\s*\{[^}]*\}\}\s*$/g, "");
  // Generic fallback to strip any trailing JSON block
  cleaned = cleaned.replace(/\s*\{[^}]*\}\s*$/g, "");
  return cleaned.trim();
}
