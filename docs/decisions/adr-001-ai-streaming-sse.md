# ADR-001: AI response streaming using Server-Sent Events (SSE) and native Web Streams

## Status
Accepted

## Date
2026-06-04

## Context
The world public holidays Next.js application retrieval flows (Base, LoRA, MCP, RAG, Reasoning) involve multi-stage AI reasoning and external lookups (such as Vector database querying and MCP tool execution). In a traditional JSON HTTP request/response model, this introduces significant latency (often 2 to 5 seconds per request), creating a slow and unresponsive user experience. We need a way to stream intermediate status logs, reasoning steps, and final results in real-time.

Key requirements:
1. Must run on the Cloudflare Pages / Next.js Edge runtime environment.
2. Must support progressive UI updates for intermediate operations (e.g. "Executing tool...") before final response synthesis.
3. Must distinguish between reasoning tokens ("thoughts") and final Markdown answers so they can be routed to separate UI sections.
4. Minimal footprint and dependency addition to prevent build bloating.

## Decision
Implement a custom Server-Sent Events (SSE) payload system using standard Web Streams (`TransformStream`, `TextEncoder`, `ReadableStream`) and native browser APIs on the client:
1. Define a structured SSE event stream format where each line is prefixed with `data: ` and contains a typed JSON payload:
   - `status`: Logs of the current pipeline operation.
   - `reasoning`: Chain-of-thought tokens for reasoning models.
   - `content`: Final output Markdown tokens.
   - `error`: Error messages.
   - `done`: Signal to close the stream.
2. Wrap the API route response in a standard `text/event-stream` Web `Response` and execute the background streaming loop asynchronously.
3. Consume the stream on the frontend using `response.body.getReader()` to parse lines, accumulate buffers, and update UI state reactively.

## Alternatives Considered

### WebSockets
- **Pros**: Bidirectional, very fast for multi-turn conversations.
- **Cons**: High infrastructure overhead, stateful connections required, not native to simple Serverless Edge functions.
- **Rejected**: The holiday query is a unidirectional stream (server-to-client after submission). SSE fits this request/response paradigm much better than a stateful WebSocket server.

### Vercel AI SDK (`ai` npm package)
- **Pros**: Pre-packaged hooks like `useCompletion` and unified stream helpers.
- **Cons**: Adds substantial dependency weight, can have lock-in or version mismatch issues, and is primarily optimized for Vercel's hosting runtime.
- **Rejected**: We can achieve the exact same stream piping in less than 100 lines of standard Web APIs (`TransformStream`), keeping our build lean and fully Edge-compatible on Cloudflare.

### Client-side `<think>` Parsing (Single Text Stream)
- **Pros**: Simple server logic (just stream the raw model output text).
- **Cons**: Requires complex stateful regex/markup parsing on the client to extract `<think>...</think>` tags and separate them from content in real-time. Fails to support intermediate status logs.
- **Rejected**: Standardizing on typed SSE events is far more robust, extensible, and makes the frontend rendering logic straightforward.

## Consequences
- **Edge Compatibility**: Fully compatible with Next.js edge API route handlers.
- **Zero Added Dependencies**: Relies entirely on standard, built-in JavaScript/browser APIs.
- **Improved UX**: Users see immediate progress steps and streaming thoughts, lowering perceived latency.
- **Error Resilience**: Any mid-stream failures are piped as structured events, letting the client show detailed failure logs rather than hanging indefinitely.
