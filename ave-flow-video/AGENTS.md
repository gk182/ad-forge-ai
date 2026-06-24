# AveFlow Video Frontend Agent Guide

This repository is the Next.js frontend for AveFlow Video. Keep instructions focused on the app structure below and avoid adding generic process noise.

## What This App Does

- `src/app` contains the Next.js App Router pages and API route handlers.
- `src/features/home` owns the main product flow: URL input, scrape results, asset selection, script generation, and studio editing.
- `src/features/settings` stores API keys, model choice, and voice settings in localStorage.
- `src/features/pipeline` holds shared types and the legacy pipeline runner.
- `src/remotion` contains the video composition used by the Remotion renderer.
- `src/app/api/*` proxies and orchestrates calls to the Python backend and local render endpoints.

## Local Setup

- Use Node.js 20+ with the existing lockfile.
- Install dependencies with `npm install`.
- Run the app with `npm run dev`.
- Lint with `npm run lint`.
- If Next.js behavior is unclear, read the matching docs under `node_modules/next/dist/docs/` before changing framework code.

## Frontend Flow

- The default user journey is:
  - paste a product URL
  - scrape product data
  - select media and capture keyframes
  - generate variants with Gemini
  - open the Remotion studio with the selected variant
  - generate voice and optionally render/export MP4
- Keep `HomeView`, `AssetSelector`, and `StudioEditor` in sync when changing this flow.
- If you change the script bundle shape, update `pipeline.types.ts`, the API routes, and the studio props together.

## Important Files

- `src/features/home/HomeView.tsx` orchestrates the main workflow state.
- `src/features/home/components/AssetSelector.tsx` handles media selection and keyframe capture.
- `src/features/home/components/StudioEditor.tsx` handles variant switching, voice, and Remotion export.
- `src/app/api/scrape/route.ts` forwards crawl requests to the Python backend.
- `src/app/api/generate-script-multimodal/route.ts` generates multi-variant scripts.
- `src/app/api/generate-structured/route.ts` proxies structured backend generation and render.
- `src/app/api/voice/route.ts` synthesizes voice.
- `src/app/api/render-remotion/route.ts` renders the final MP4 locally.
- `src/remotion/AdVideo.tsx` is the final composition used during rendering.

## Working Rules

- Keep route payloads and frontend types aligned. Update both sides of a contract in the same change.
- Preserve fallback behavior for missing media, missing API keys, and render failures.
- Do not introduce unstable values into SSR or client hydration paths unless they are isolated to client-only code.
- Prefer the existing dark neon visual language in `globals.css`; do not replace it with default system styling.
- Use `apply_patch` for edits. Do not rewrite files with ad hoc shell redirection.
- Do not modify generated assets in `public/renders/` unless the task is explicitly about them.

## Testing Checklist

- Run `npm run lint` after frontend edits.
- Run `npx tsc --noEmit` if you touch route payloads, shared types, or studio props.
- Manually verify:
  - scrape flow still returns product data
  - `generate-script-multimodal` returns variants and selected variant
  - studio can load the selected variant
  - voice generation works with Free TTS and ElevenLabs
  - Remotion render completes and the MP4 is downloadable

## Common Pitfalls

- Hydration mismatch errors usually come from browser-only state leaking into SSR or from browser extensions modifying the DOM.
- If a video scene crashes in Remotion, validate the media URL first and fall back to an image when the URL is not a real video.
- If the UI gets stuck in a build loop, check `StudioEditor` state invalidation and `HomeView` workflow transitions.
- When updating the script generator, keep the `script_text`, `scenes`, and `on_video_script` fields consistent.

## Style Notes

- Keep logs short and prefixed, such as `[Gemini Multimodal]`, `[Remotion Render]`, or `[Voice API]`.
- Keep React changes localized and explicit. Update shared types before wiring new props through components.
- Use the smallest change that fixes the flow end-to-end.
