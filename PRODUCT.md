# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Health-conscious individuals looking for quick macro tracking.

## Product Purpose
To log meals quickly using natural language, keeping track of daily calories, protein, fat, carbs, and fiber.

## Positioning
A fast, local-first tracker that works entirely in the browser. It combines the ease of natural language entry (via Gemini) with local caching and data ownership.

## Operating Context
Used daily, typically around meal times on personal devices (mostly mobile or desktop browser) to quickly jot down what was eaten.

## Capabilities and Constraints
- Natural language food logging with automatic macro resolution.
- Local-first caching of food data (IndexedDB).
- Deployed via Cloudflare Pages/Workers (SvelteKit).
- Fast, minimal, text-focused UI without bloat.

## Brand Commitments
- Keep it minimal, fast, and text-focused.

## Evidence on Hand
- SvelteKit application configured with Vite and Cloudflare adapter.
- Local food caching implementation via `idb`.
- Gemini integration for resolving unknown foods.

## Product Principles
- **Fast Data Entry**: Entering meals should take seconds, leveraging natural language.
- **Local First**: Data stays on the device for speed, reliability, and privacy.
- **Minimalist Approach**: Text-focused design, removing unnecessary visual clutter.
