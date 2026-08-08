import { json } from '@sveltejs/kit';
import { GEMINI_API_KEY } from '$env/static/private';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are a no-bullshit fitness nutrition assistant. Given a person's food log for the day, write a brief 2-3 sentence summary. Be direct and useful. Comment on:
- Whether protein looks adequate (assume ~1g per lb bodyweight, so ~150-180g is a common target)
- Any obvious imbalances (too much fat, not enough fiber, etc.)
- One actionable suggestion if relevant

Keep it casual, short, and honest. No fluff, no encouragement like "great job!", no emoji. Write like a gym buddy who knows nutrition, not a corporate wellness app.`;

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {
	if (!GEMINI_API_KEY) {
		return json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
	}

	const { items, totals } = await request.json();

	if (!items || !items.length) {
		return json({ error: 'No items to summarize' }, { status: 400 });
	}

	const foodList = items.map(i => `- ${i.name}: ${i.qty_g}g (${Math.round(i.cal)} cal, ${i.protein}g P, ${i.fat}g F, ${i.carbs}g C, ${i.fiber}g fiber)`).join('\n');

	const prompt = `Here's what I ate today so far:

${foodList}

Totals: ${Math.round(totals.cal)} cal, ${totals.protein}g protein, ${totals.fat}g fat, ${totals.carbs}g carbs, ${totals.fiber}g fiber.

Give me a quick take.`;

	try {
		const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				system_instruction: {
					parts: [{ text: SYSTEM_PROMPT }]
				},
				contents: [
					{
						role: 'user',
						parts: [{ text: prompt }]
					}
				],
				generationConfig: {
					temperature: 0.7,
					maxOutputTokens: 200
				}
			})
		});

		if (!res.ok) {
			return json({ error: 'Gemini API request failed' }, { status: 502 });
		}

		const data = await res.json();
		const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

		if (!text) {
			return json({ error: 'Empty response' }, { status: 502 });
		}

		return json({ summary: text.trim() });
	} catch (err) {
		console.error('Summary error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
