import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent';

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

		if (!res.ok) {
			const errText = await res.text();
			console.error('Gemini API error:', res.status, errText);
			return json({ error: 'Gemini API request failed' }, { status: 502 });
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
