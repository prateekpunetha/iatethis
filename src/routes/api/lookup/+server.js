import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/* GA model. the 3.1 preview one 503'd on ~half of requests */
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/* quota is per project, so all users share one bucket. retry on the two
   temporary codes — jitter so everyone doesn't retry in the same instant */
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1000;

/** @param {number} attempt */
function retryDelay(attempt) {
	return RETRY_BASE_MS * attempt + Math.floor(Math.random() * 500);
}

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

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {
	const apiKey = env.GEMINI_API_KEY;
	if (!apiKey) {
		return json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
	}

	const { food } = await request.json();

	if (!food || typeof food !== 'string') {
		return json({ error: 'Missing or invalid food parameter' }, { status: 400 });
	}

	try {
		const body = JSON.stringify({
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
		});

		let res = null;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body
			});

			/* 429 and 503 are temporary by definition, retry them */
			if (res.ok || (res.status !== 429 && res.status !== 503)) break;

			if (attempt < MAX_ATTEMPTS) {
				const wait = retryDelay(attempt);
				console.warn(`Gemini ${res.status} for "${food}", retry ${attempt + 1}/${MAX_ATTEMPTS} in ${wait}ms`);
				await new Promise(r => setTimeout(r, wait));
			}
		}

		if (!res.ok) {
			const errText = await res.text();
			console.error('Gemini API error:', res.status, errText);
			/* pass the real status through so the app can say "busy" vs "missed" */
			const temporary = res.status === 429 || res.status === 503;
			return json(
				{ error: 'Gemini API request failed', status: res.status, temporary },
				{ status: temporary ? 503 : 502 }
			);
		}

		const data = await res.json();
		const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

		if (!text) {
			return json({ error: 'Empty response from Gemini' }, { status: 502 });
		}

		/* parse the JSON response */
		let parsed;
		try {
			/* strip markdown code fences if present (just in case) */
			const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
			parsed = JSON.parse(cleaned);
		} catch (e) {
			console.error('Failed to parse Gemini response:', text);
			return json({ error: 'Failed to parse nutrition data' }, { status: 502 });
		}

		/* validate structure */
		if (!parsed.name || !parsed.per_100g || typeof parsed.per_100g.cal !== 'number') {
			return json({ error: 'Invalid nutrition data structure' }, { status: 502 });
		}

		return json({
			...parsed,
			source: 'gemini'
		});
	} catch (err) {
		console.error('Lookup error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
