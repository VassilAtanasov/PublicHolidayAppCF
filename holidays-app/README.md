# World Public Holidays

A Next.js app that checks which countries have national public holidays on a given date by calling Cloudflare Workers AI.

## Stack

- Next.js 16
- App Router
- TypeScript
- Tailwind CSS
- Cloudflare Workers AI
- OpenNext for Cloudflare
- Wrangler

## Local Development

Install dependencies:

```bash
cd holidays-app
npm install
```

Create a local env file named `.env.local`:

```env
CLOUDFLARE_WORKERS_AI_ACCOUNT_ID=395dec4bb97ccf6a2a1dfc7e4e81116f
CLOUDFLARE_WORKERS_AI_API_TOKEN=your_workers_ai_token
```

Start the app:

```bash
npm run dev
```

Open http://localhost:3000

## Cloudflare Account

This project is intended to deploy to this specific Cloudflare account:

- Account ID: `395dec4bb97ccf6a2a1dfc7e4e81116f`
- Dashboard: https://dash.cloudflare.com/395dec4bb97ccf6a2a1dfc7e4e81116f

The app runtime also uses this same account ID when calling Workers AI.

## Required Credentials

You need a Cloudflare API token with Workers AI access for the application runtime.

Create it here:

https://dash.cloudflare.com/profile/api-tokens

Add these values to `.env.local`:

```env
CLOUDFLARE_WORKERS_AI_ACCOUNT_ID=395dec4bb97ccf6a2a1dfc7e4e81116f
CLOUDFLARE_WORKERS_AI_API_TOKEN=your_workers_ai_token
```

## Deploying To Cloudflare

This project deploys with Wrangler and OpenNext for Cloudflare.

1. Authenticate Wrangler:

```bash
npx wrangler login
```

2. Confirm the authenticated user has access to account `395dec4bb97ccf6a2a1dfc7e4e81116f`.

3. Set the production secrets on the deployed worker:

```bash
npx wrangler secret put CLOUDFLARE_WORKERS_AI_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_WORKERS_AI_API_TOKEN
```

When prompted for `CLOUDFLARE_WORKERS_AI_ACCOUNT_ID`, enter:

```text
395dec4bb97ccf6a2a1dfc7e4e81116f
```

4. Deploy:

```bash
npm run deploy
```

## Useful Commands

Run the standard Next.js dev server:

```bash
npm run dev
```

Build the Next.js app:

```bash
npm run build
```

Preview the Cloudflare worker build locally:

```bash
npm run preview
```

Deploy to Cloudflare:

```bash
npm run deploy
```

Upload a new version without immediately deploying it:

```bash
npm run upload
```

Generate Cloudflare env types:

```bash
npm run cf-typegen
```

## Important Notes

- This repo uses `@opennextjs/cloudflare`, not the older `@cloudflare/next-on-pages` adapter.
- Cloudflare worker configuration lives in `wrangler.jsonc`.
- Cloudflare build output is generated under `.open-next/`.
- If builds are unreliable on native Windows, run the deploy flow from WSL for better compatibility.

## Key Files

- `app/page.tsx`
- `app/api/holidays/route.ts`
- `next.config.ts`
- `open-next.config.ts`
- `wrangler.jsonc`
- `.env.example`

## Troubleshooting

If deployment fails, check these first:

- Wrangler login is using a user that has access to account `395dec4bb97ccf6a2a1dfc7e4e81116f`.
- `CLOUDFLARE_WORKERS_AI_ACCOUNT_ID` is set to `395dec4bb97ccf6a2a1dfc7e4e81116f` locally and as a deployed secret.
- `CLOUDFLARE_WORKERS_AI_API_TOKEN` is valid and has Workers AI permission.
- The worker name in `wrangler.jsonc` does not conflict with another worker in the same account.


## Claudflare github integration is enabled