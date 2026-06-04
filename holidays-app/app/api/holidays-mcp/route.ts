import { createSseResponse, streamCloudflareAiResponse } from "../stream-utils";

export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
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
    const mcpUrl = process.env.MCP_URL || DEFAULT_MCP_URL;

    if (!accountId || !apiToken) {
      await writeError("Missing Cloudflare configuration.");
      return response;
    }

    const formattedDate = formatDate(date);
    const finalSystemPrompt = systemPrompt || `${SYSTEM_PROMPT} Today is ${formattedDate}.`;

    // 1. Fetch available tools dynamically from the MCP Server using the tools/list RPC
    await writeEvent("status", "Connecting to MCP server...");
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
        await writeEvent("status", `Discovered ${mcpTools.length} tools on MCP server.`);
      } else {
        console.error(`Failed to list tools from MCP server. Status: ${listResponse.status}`);
        await writeEvent("status", "Warning: Failed to list tools from MCP server. Falling back to direct model query.");
      }
    } catch (err) {
      console.error("Error communicating with MCP server for tools/list:", err);
      await writeEvent("status", "Warning: MCP server offline. Falling back to direct model query.");
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
    await writeEvent("status", "Running initial model query to check for tool calls...");

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
      tools: tools.length > 0 ? tools : undefined
    };

    // 3. Make initial AI request (non-streaming to extract tool calls cleanly)
    const initialResponse = await fetch(
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

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      console.error(`AI API Error (${initialResponse.status}):`, errorText);
      await writeError(`Failed to fetch from Cloudflare Workers AI: ${errorText}`);
      return response;
    }

    const data = (await initialResponse.json()) as {
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

    // Extract tool calls
    const choiceToolCalls = data.result?.choices?.[0]?.message?.tool_calls;
    const flatToolCalls = data.result?.tool_calls;
    const toolCalls = choiceToolCalls || flatToolCalls;

    // 4. Handle tool execution if the AI model wants to use an MCP tool
    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0] as any;
      console.log("Model requested MCP tool call:", toolCall);

      const toolName = toolCall.name || toolCall.function?.name;
      const toolArguments = toolCall.arguments || toolCall.function?.arguments;
      const callId = toolCall.id || `call_${toolName}_0`;

      if (!toolName) {
        console.error("Could not find tool name in tool call:", toolCall);
        const modelResponse = data.result?.response ?? "No results returned due to invalid tool call.";
        await writeEvent("content", modelResponse);
        await close();
        return response;
      }

      let parsedArgs = {};
      try {
        parsedArgs = typeof toolArguments === "string"
          ? JSON.parse(toolArguments)
          : (toolArguments || {});
      } catch (err) {
        console.error("Failed to parse tool call arguments:", err);
      }

      await writeEvent("status", `Executing MCP tool: ${toolName}...`);
      console.log(`Executing tool "${toolName}" on MCP server with args:`, parsedArgs);

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
          await writeEvent("status", `Tool "${toolName}" completed successfully.`);
        } else {
          const errText = await mcpResponse.text();
          console.error(`MCP Server returned error status (${mcpResponse.status}):`, errText);
          toolResultText = `Error: MCP server failed to execute the tool. Status: ${mcpResponse.status}`;
          await writeEvent("status", `Tool "${toolName}" failed. Continuing with error content.`);
        }
      } catch (err) {
        console.error("Error communicating with MCP server for tools/call:", err);
        toolResultText = `Error: Could not communicate with the MCP server to run the tool. ${err instanceof Error ? err.message : ""}`;
        await writeEvent("status", `Could not contact MCP server to execute "${toolName}".`);
      }

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

      const toolResultMessage = {
        role: "tool" as const,
        content: toolResultText,
        tool_call_id: callId
      };

      console.log("Sending tool result back to Cloudflare Workers AI for final response...");
      await writeEvent("status", "Generating final response with tool context...");

      const assistantContent = data.result?.response || data.result?.choices?.[0]?.message?.content || "";

      const finalPayload = {
        messages: [
          { role: "system", content: finalSystemPrompt },
          { role: "user", content: finalUserPrompt },
          { role: "assistant", content: assistantContent, tool_calls: formattedToolCalls },
          toolResultMessage
        ],
        stream: true // Enable streaming for final output
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
        await writeError(`Final response error: ${errorText}`);
        return response;
      }

      // Start streaming asynchronously
      void streamCloudflareAiResponse(finalResponse, writeEvent)
        .then(close)
        .catch(async (err) => {
          console.error("Streaming error in MCP:", err);
          await writeError(err instanceof Error ? err.message : String(err));
        });

      return response;
    }

    // No tool calls - return direct response
    await writeEvent("status", "Direct response returned from model.");
    const modelResponse = data.result?.response || data.result?.choices?.[0]?.message?.content || "";
    await writeEvent("content", modelResponse);
    await close();
    return response;

  } catch (error) {
    console.error("Error executing POST:", error instanceof Error ? error.stack : error);
    await writeError("Failed to process request");
    return response;
  }
}

