# Deprecation Notice & Migration Guide: Public Holidays JSON API

**Status:** Deprecated as of 2026-06-04  
**Replacement:** Server-Sent Events (SSE) Streaming API  
**Target Removal Date:** Advisory — no hard deadline, supported during transition phase  

## Reason for Change
The original public holiday lookup endpoints returned a single flat JSON object. Due to multi-step execution (including Vector database search, LLM routing, and MCP tool execution), requests had high latency (2 to 5 seconds), leading to a slow and unresponsive user interface. 

The replacement SSE streaming system streams status updates, reasoning blocks, and final answers progressively, reducing perceived latency to under 100ms.

---

## Backward Compatibility & Transition Safety
To ensure zero breaking changes for legacy clients during the migration phase, all five endpoints support both formats based on the client's request headers or payload parameters:

1. **Streaming Mode (Default/New)**:
   - Triggered when request has `Accept: text/event-stream`, or if the body payload has `stream: true`, or if no specific JSON override is passed.
   - Returns: `text/event-stream` body with JSON-lines format (`data: {"type": "content", "text": "..."}`).

2. **Legacy JSON Mode (Deprecated)**:
   - Triggered when request has `Accept: application/json` header, or if the body payload has `stream: false`.
   - Returns: `application/json` body with schema `{ source: string, result: string, request: object, response: object }`.

---

## Migration Guide for Clients

### 1. Migrating Fetch Code

#### Before (Legacy JSON Fetch):
```typescript
const response = await fetch("/api/holidays-base", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ date: "2026-10-31" })
});
const data = await response.json();
console.log(data.result);
```

#### After (New SSE Stream Reader):
```typescript
const response = await fetch("/api/holidays-base", {
  method: "POST",
  headers: { 
    "Content-Type": "application/json",
    "Accept": "text/event-stream" // Explicitly request stream
  },
  body: JSON.stringify({ date: "2026-10-31", stream: true })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (line.trim().startsWith("data: ")) {
      const payload = JSON.parse(line.slice(6));
      if (payload.type === "content") {
        process.stdout.write(payload.text); // Stream output
      }
    }
  }
}
```

### 2. Event Types reference
When consuming the new stream, you should switch on `type` to route information correctly:
- `status`: Logs of the execution pipeline (e.g. "Connecting to MCP server...")
- `reasoning`: Reasoning/thinking blocks of reasoning models (e.g. Qwen/Gemma)
- `content`: Final holiday Markdown answer chunks
- `error`: Stream level errors
- `done`: Stream complete token

---

## Verification Plan for Migration
1. Ensure both JSON-based curl requests and SSE-based fetch queries succeed on all endpoints.
2. Confirm that legacy code still parses JSON results correctly when using `Accept: application/json`.
