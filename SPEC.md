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
│   ├── page.tsx                  # Main UI page
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Global styles
│   └── api/
│       └── holidays/
│           └── route.ts          # API route — builds prompt, calls CF Workers AI
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

## API Route

**File:** `app/api/holidays/route.ts`

### Behaviour
- Accepts `POST` requests with JSON body `{ date: "YYYY-MM-DD" }`
- Formats the date as a human-readable string (e.g. `"Sunday, April 6, 2025"`)
- Builds the prompt (see below)
- Calls Cloudflare Workers AI REST API
- Returns JSON `{ result: string }`

### Edge Runtime
```ts
export const runtime = "edge";
```

### Cloudflare Workers AI endpoint
```
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL}
Authorization: Bearer {API_TOKEN}
Content-Type: application/json
```

### Request body sent to CF Workers AI
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a precise world holiday reference. Return only what is asked. No markdown, no extra commentary."
    },
    {
      "role": "user",
      "content": "<prompt — see below>"
    }
  ]
}
```

### Prompt template
```
Return a plain-text list (no other Markdown). List national public holidays (off work) on ${formattedDate} worldwide. Always put United States holidays first (if any). Verify it is a non-working day in the country. Group by holiday name with countries in parentheses, ordered by popularity. No explanations.
```

Where `formattedDate` is the date formatted as: `"Sunday, April 6, 2025"`

### Response handling
The CF Workers AI response shape is:
```json
{ "result": { "response": "plain text here" } }
```
Extract `data.result.response` and return it as `{ result: string }`.

### Error handling
- If the fetch fails or the response is not OK, return HTTP 500 with `{ error: "Failed to fetch from Cloudflare Workers AI" }`
- If `data.result.response` is missing, return `{ result: "No results returned." }`

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
