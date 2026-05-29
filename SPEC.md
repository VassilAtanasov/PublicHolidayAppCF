# World Public Holidays — Project Specification

## Overview

A Next.js web application that tells the user which public holidays are being celebrated worldwide on a given date. The app takes a date as input, sends it to a Cloudflare Workers AI model via a Next.js API route, and displays the plain-text result on the page.

This is a personal training/learning project. It will be deployed to Cloudflare Pages using the free tier.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) |
| Styling | Tailwind CSS |
| AI Backend | Cloudflare Workers AI (REST API) |
| AI Model | `@cf/meta/llama-3.1-8b-instruct-fp8-fast` |
| Hosting | Cloudflare Pages |
| Runtime | Edge (`export const runtime = "edge"`) |

---

## Project Structure

```
holidays-app/
├── app/
│   ├── page.tsx                  # Main UI page (selects base, lora, or mcp modes)
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Global styles
│   └── api/
│       ├── holidays-base/
│       │   └── route.ts          # API route — Base model (@cf/google/gemma-7b-it-lora)
│       ├── holidays-lora/
│       │   └── route.ts          # API route — LoRA adapter model (@cf/google/gemma-7b-it-lora + custom lora)
│       └── holidays-mcp/
│           └── route.ts          # API route — MCP Worker (@cf/meta/llama-3.1-8b-instruct-fp8-fast + MCP server)
├── .env.local                    # Environment variables (not committed)
├── .env.example                  # Example env file (committed)
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Environment Variables

### `.env.local` (never commit this)
```
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
```

### `.env.example` (commit this)
```
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

The Cloudflare API token needs the **Workers AI** permission. Create it at:
`https://dash.cloudflare.com/profile/api-tokens`

---

## API Routes

The application features three specialized API routes to handle different execution modes selected in the UI:

### 1. Base Model Route (`app/api/holidays-base/route.ts`)
- **Model:** `@cf/google/gemma-7b-it-lora`
- **Behavior:** Queries the base Gemma model directly using standard pretrained general knowledge.

### 2. LoRA Adapter Route (`app/api/holidays-lora/route.ts`)
- **Model:** `@cf/google/gemma-7b-it-lora` with custom adapter `my-holiday-lora`.
- **Behavior:** Queries the fine-tuned holiday adapter for high precision on verified holiday dates without needing external database calls.

### 3. MCP Worker Route (`app/api/holidays-mcp/route.ts`)
- **Model:** `@cf/meta/llama-3.1-8b-instruct-fp8-fast`
- **Behavior:** Exposes dynamic holiday lookup by integrating standard MCP (Model Context Protocol) tools over JSON-RPC 2.0.
  - Dynamically fetches available tools using `tools/list` RPC from the MCP server (running on `http://localhost:8787` by default).
  - Performs native Worker AI function calling to execute tools (e.g. `get_most_common_holiday`).
  - Feeds execution results back to Llama 3.1 for verified holiday answers.

### Endpoint Details (MCP Example)

#### Edge Runtime
```ts
export const runtime = "edge";
```

#### Cloudflare Workers AI Endpoint
```
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL}
Authorization: Bearer {API_TOKEN}
Content-Type: application/json
```

#### Request / Response schemas are standard Workers AI format:
- For **MCP mode**, tool definitions matching the MCP tools are appended to the payload.
- Standard OpenAI-compatible `tool_calls` structure (nested `function.name` / `function.arguments`) is supported.

---

## Frontend Page

**File:** `app/page.tsx`

### UI Elements

1. **Page title** — "World Public Holidays"
2. **Subtitle** — "See which countries are off work on any date"
3. **Date input** — `<input type="date">`, pre-filled with today's date in `YYYY-MM-DD` format
4. **Submit button** — "Check holidays", disabled while loading
5. **Loading state** — show "Checking holidays for {formatted date}..." while waiting
6. **Result area** — displays the plain-text response from the API
7. **Error state** — shows a friendly error message if the API call fails

### Behaviour
- On page load, date input is set to today (`new Date().toISOString().split("T")[0]`)
- On button click: POST to `/api/holidays` with `{ date }`, show loading, then show result
- Result is displayed in a `<pre>` with `whitespace-pre-wrap` so line breaks render correctly

### Layout
- Centered, max-width `640px`, with comfortable padding
- Clean, minimal design using Tailwind utility classes
- The result area has a subtle background (`bg-gray-50`) and rounded corners

---

## Next.js Config

**File:** `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

No special config needed for local development. For Cloudflare Pages deployment, the `@cloudflare/next-on-pages` adapter handles edge compatibility.

---

## Deployment to Cloudflare Pages

### Install adapter
```bash
npm install -D @cloudflare/next-on-pages
```

### Build command (set in Cloudflare Pages dashboard)
```
npx @cloudflare/next-on-pages
```

### Output directory
```
.vercel/output/static
```

### Environment variables (set in Cloudflare Pages dashboard)
```
CLOUDFLARE_ACCOUNT_ID = your_account_id
CLOUDFLARE_API_TOKEN  = your_api_token
```

---

## Running Locally

```bash
# Install dependencies
npm install

# Add your credentials to .env.local
cp .env.example .env.local
# Edit .env.local with your Cloudflare Account ID and API Token

# Start dev server
npm run dev

# Open http://localhost:3000
```

---

## Free Tier Constraints

- Cloudflare Workers AI free tier: **10,000 Neurons/day**
- Model used (`llama-3.1-8b-instruct-fp8-fast`) costs ~15 neurons per request
- Free tier supports approximately **~650 requests/day** — more than enough for personal use
- Limits reset daily at 00:00 UTC

---

## Future Extensions (not in scope now)

These are planned additions for later iterations:

- **User preferences** — filter by region, continent, or religion
- **Country filter** — show only selected countries
- **Favorites** — remember user's preferred countries
- **Calendar view** — show holidays in a monthly calendar layout
- **Upcoming holidays** — show next N holidays from today

---

## Notes for Claude Code

- Use TypeScript throughout — no plain `.js` files
- Use the App Router (not Pages Router)
- Keep the API route on the **edge runtime** (`export const runtime = "edge"`)
- Do not use `axios` — use native `fetch`
- Do not use any UI component library — plain Tailwind only
- The `.env.local` file should NOT be created — only `.env.example`
- After scaffolding, remind the user to: (1) create `.env.local`, (2) add their Cloudflare credentials
