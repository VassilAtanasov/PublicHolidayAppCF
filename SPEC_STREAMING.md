# Spec: AI Streaming & Progressive Display

## Objective
Implement streaming requests to Cloudflare Workers AI models across all five execution modes (Base, LoRA, MCP, RAG, Reasoning) using Next.js Edge API routes and Server-Sent Events (SSE). The frontend UI will parse the stream and progressively display the output in real-time, including:
1. Live execution status steps (e.g. "Fetching tools...", "Querying Vector Database...", "Executing tool...").
2. Live reasoning/thinking tokens displayed in a distinct thinking panel (for reasoning mode).
3. Live final completion markdown content streamed word-by-word into the result area.

## Tech Stack
- **Framework**: Next.js 16+ (App Router, Edge Runtime)
- **Styling**: Tailwind CSS
- **AI Backend**: Cloudflare Workers AI (SSE text/event-stream)
- **Client SSE Parser**: Custom browser-native stream reader (`ReadableStreamDefaultReader`)

## Commands
- **Dev**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: `npm run lint`

## Project Structure
We will modify the existing files in `PublicHolidayAppCF`:
- `holidays-app/app/api/holidays-base/route.ts` -> Update to support streaming
- `holidays-app/app/api/holidays-lora/route.ts` -> Update to support streaming
- `holidays-app/app/api/holidays-rag/route.ts` -> Update to support streaming
- `holidays-app/app/api/holidays-reasoning/route.ts` -> Update to support streaming
- `holidays-app/app/api/holidays-mcp/route.ts` -> Update to support streaming
- `holidays-app/app/page.tsx` -> Update frontend state and SSE stream parser

## Code Style
We will write clean, asynchronous TypeScript code. On the client, we will use a generator or reader loop to process stream chunks:
```typescript
const response = await fetch("/api/holidays-base", { ... });
const reader = response.body?.getReader();
const decoder = new TextDecoder();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // Parse SSE events: data: {"type": "content", "text": "..."}
}
```

## Testing Strategy
- **Manual Verification**: Run `npm run dev` and click each of the 5 modes to confirm that:
  - Progress steps print incrementally in the UI.
  - The reasoning/thinking text updates in real-time for reasoning mode.
  - The final holiday list streams progressively with a smooth typography update.
  - Errors are captured and displayed gracefully in the UI.

## Boundaries
- **Always**:
  - Keep the API routes on the Edge runtime (`export const runtime = "edge"`).
  - Use standard SSE format (`text/event-stream`).
  - Flush the stream writer regularly to ensure real-time chunk delivery.
- **Ask first**:
  - Changing the AI model parameters or prompts (unless required for streaming compatibility).
- **Never**:
  - Introduce third-party streaming libraries (like `ai` or socket packages) on the client or server. Keep it lightweight and native.

## Success Criteria
- [ ] Base and LoRA modes stream their holiday answers in real-time.
- [ ] RAG mode streams intermediate steps (e.g. "Extracting query criteria", "Querying vector database") before streaming the final synthesized answer.
- [ ] MCP mode streams intermediate steps (e.g. "Listing tools", "Executing tool: get_most_common_holiday") before streaming the final response.
- [ ] Reasoning mode streams the reasoning thoughts inside a visible "Thinking" section, then streams the final answer below it.
- [ ] The UI progressively parses the streams using native browser streams and displays them without layout thrashing.
- [ ] Any network or API errors during the stream are caught and presented as a "Query Execution Failed" message.
