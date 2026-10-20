import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const CLOUDFLARE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

/* Fallback Gemini config if running in local vite dev without platform.env.AI */
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are a nutrition database. Given a food item, return ONLY valid JSON with its nutritional information per 100 grams. No markdown, no explanation, no code fences — just the raw JSON object.

Use this exact structure:
{
  "name": "standardized food name in english",
  "aliases": ["common alternate names including hindi/regional names"],
  "per_100g": {
    "cal": <number>,
    "protein": <number>,
    "fat": <number>,
    "carbs": <number>,
    "fiber": <number>
  },
  "default_serving": "<human readable serving like '1 piece' or '1 cup'>",
  "default_serving_g": <number in grams>
}

Rules:
- Use cooked/prepared values for cooked foods, raw values for raw foods.
- For Indian foods, prefer IFCT (Indian Food Composition Tables) values.
- For international foods, prefer USDA FoodData Central values.
- Be accurate. Do not guess. If unsure, use the most commonly cited values.
- All numbers should be plain numbers, no units in the values.`;

/**
 * Extracts and cleans a JSON substring from AI model output
 * @param {any} text
 */
function cleanAndParseJson(text) {
	if (typeof text !== 'string') {
		text = JSON.stringify(text);
	}
	// Extract JSON object if surrounded by markdown or explanatory text
	const match = text.match(/\{[\s\S]*\}/);
	const jsonStr = match ? match[0] : text;
	return JSON.parse(jsonStr);
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request, platform }) {
	const { food } = await request.json();

	if (!food || typeof food !== 'string') {
		return json({ error: 'Missing or invalid food parameter' }, { status: 400 });
	}

	// 1. Primary: Cloudflare Workers AI (10,000 free neurons/day, zero key expiration)
	if (platform?.env?.AI) {
		try {
			const aiRes = await platform.env.AI.run(CLOUDFLARE_MODEL, {
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: `Food item: "${food}"` }
				],
				temperature: 0.1,
				max_tokens: 350
			});

			const rawText = aiRes?.response;
			if (!rawText) {
				return json({ error: 'Empty response from Cloudflare AI' }, { status: 502 });
			}

			const parsed = cleanAndParseJson(rawText);

			if (!parsed.name || !parsed.per_100g || typeof parsed.per_100g.cal !== 'number') {
				return json({ error: 'Invalid nutrition data structure from Cloudflare AI' }, { status: 502 });
			}

			return json({
				...parsed,
				source: 'cloudflare'
			});
		} catch (err) {
			console.error('Cloudflare Workers AI lookup error:', err);
			// If Cloudflare AI fails, continue to check fallback if available
		}
	}

	// 2. Fallback: Gemini API (useful during local Vite dev when platform.env.AI isn't mounted)
	const apiKey = env.GEMINI_API_KEY;
	if (apiKey) {
		try {
			const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					system_instruction: {
						parts: [{ text: SYSTEM_PROMPT }]
					},
					contents: [
						{
							role: 'user',
							parts: [{ text: `Food item: "${food}"` }]
						}
					],
					generationConfig: {
						temperature: 0.1,
						responseMimeType: 'application/json'
					}
				})
			});

			if (res.ok) {
				const data = await res.json();
				const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
				if (text) {
					const parsed = JSON.parse(text);
					if (parsed.name && parsed.per_100g && typeof parsed.per_100g.cal === 'number') {
						return json({
							...parsed,
							source: 'gemini'
						});
					}
				}
			}
		} catch (err) {
			console.error('Gemini fallback lookup error:', err);
		}
	}

	return json({ error: 'AI lookup failed. Please try again.' }, { status: 502 });
}
