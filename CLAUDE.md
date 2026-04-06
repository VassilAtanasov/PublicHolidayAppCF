# Claude Code — Build Instructions

You are building a Next.js web application called **World Public Holidays**.

Read the full project specification in `SPEC.md` before writing any code.

## Your task

Scaffold the complete application from scratch. Create every file needed to run the app with `npm run dev`.

## Steps

1. Run `npx create-next-app@latest holidays-app --typescript --app --tailwind --eslint --no-src-dir --import-alias "@/*"` to create the project
2. `cd holidays-app`
3. Create the API route at `app/api/holidays/route.ts` — exactly as specified in SPEC.md
4. Replace `app/page.tsx` with the frontend page described in SPEC.md
5. Replace `app/globals.css` with minimal global styles (just the Tailwind directives)
6. Create `.env.example` with empty placeholder variables
7. Update `next.config.ts` as specified
8. Run `npm run build` to verify the project compiles without errors
9. Report any issues and fix them

## Do not

- Do not create `.env.local` (the user must add their own credentials)
- Do not install any UI component libraries
- Do not use axios — use native fetch only
- Do not use the Pages Router
- Do not add unnecessary dependencies

## After completion

Print a summary telling the user:
1. Which files were created
2. How to add their `.env.local` with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`
3. How to run the app: `npm run dev`
4. Where to get their Cloudflare credentials: https://dash.cloudflare.com/profile/api-tokens
