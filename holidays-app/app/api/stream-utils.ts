export type StreamEventType = "status" | "reasoning" | "content" | "error" | "done" | "request" | "rag_details";

/**
 * Creates a standard Server-Sent Events (SSE) response and returns utility functions
 * for writing typed events (status, reasoning, content, error) and closing the stream.
 */
export function createSseResponse() {
  const transformStream = new TransformStream();
  const writer = transformStream.writable.getWriter();
  const encoder = new TextEncoder();

  const writeEvent = async (type: StreamEventType, payload: Record<string, any> | string) => {
    const data = typeof payload === "string" ? { text: payload } : payload;
    const sseLine = `data: ${JSON.stringify({ type, ...data })}\n\n`;
    await writer.write(encoder.encode(sseLine));
  };

  const close = async () => {
    try {
      await writeEvent("done", {});
      await writer.close();
    } catch (e) {
      console.warn("Failed to close stream writer:", e);
    }
  };

  const writeError = async (errorMessage: string) => {
    try {
      await writeEvent("error", { error: errorMessage });
      await writer.close();
    } catch (e) {
      console.warn("Failed to write error to stream writer:", e);
    }
  };

  return {
    response: new Response(transformStream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    }),
    writeEvent,
    close,
    writeError,
  };
}

/**
 * Consumes a Cloudflare Workers AI event stream and writes decoded tokens
 * (content/reasoning) to the client's SSE writeEvent handler.
 */
export async function streamCloudflareAiResponse(
  cfResponse: Response,
  writeEvent: (type: StreamEventType, payload: Record<string, any> | string) => Promise<void>
) {
  if (!cfResponse.body) {
    throw new Error("No response body from Cloudflare Workers AI");
  }

  const reader = cfResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Cloudflare SSE uses 'data: ' prefix
        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === "[DONE]") {
            break;
          }

          try {
            const dataJson = JSON.parse(dataStr);
            // Extract text content or reasoning content from the chunk
            const content = dataJson.response || dataJson.choices?.[0]?.delta?.content || "";
            const reasoning = dataJson.reasoning || dataJson.choices?.[0]?.delta?.reasoning || "";

            if (reasoning) {
              await writeEvent("reasoning", { text: reasoning });
            }
            if (content) {
              await writeEvent("content", { text: content });
            }
          } catch (e) {
            console.warn("Failed to parse chunk JSON:", dataStr, e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
