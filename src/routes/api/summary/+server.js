import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const CLOUDFLARE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are a concise nutrition analyst. Given a person's food log for the day, write a 2-3 sentence daily briefing.
Comment directly on:
- Protein progress against a typical target (~140-160g)
- Balance of carbs, fat, or fiber
- One actionable takeaway for the rest of the day

Tone: Professional, direct, editorial, calm. No cheerleading, no emojis, no boilerplate introductions. Speak like a modern health briefing (Fitbit/Whoop).`;

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request, platform }) {
	const { items, totals } = await request.json();

	if (!items || !items.length) {
		return json({ error: 'No items to summarize' }, { status: 400 });
	}

	const foodList = items.map(i => `- ${i.name}: ${i.qty_g}g (${Math.round(i.cal)} cal, ${i.protein}g P, ${i.fat}g F, ${i.carbs}g C, ${i.fiber}g fiber)`).join('\n');

	const prompt = `Today's food log:

${foodList}

Totals: ${Math.round(totals.cal)} kcal, ${totals.protein}g protein, ${totals.fat}g fat, ${totals.carbs}g carbs, ${totals.fiber}g fiber.

Provide today's brief:`;

	// 1. Primary: Cloudflare Workers AI with streaming
	if (platform?.env?.AI) {
		try {
			const stream = await platform.env.AI.run(CLOUDFLARE_MODEL, {
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: prompt }
				],
				temperature: 0.5,
				max_tokens: 250,
				stream: true
			});

			return new Response(stream, {
				headers: {
					'Content-Type': 'text/event-stream; charset=utf-8',
					'Cache-Control': 'no-cache, no-transform',
					'Connection': 'keep-alive'
				}
			});
		} catch (err) {
			console.error('Cloudflare Workers AI summary stream error:', err);
		}
	}

	// 2. Fallback: Gemini API (non-stream fallback)
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
							parts: [{ text: prompt }]
						}
					],
					generationConfig: {
						temperature: 0.7,
						maxOutputTokens: 200
					}
				})
			});

			if (res.ok) {
				const data = await res.json();
				const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
				if (text) {
					return json({ summary: text.trim(), source: 'gemini' });
				}
			}
		} catch (err) {
			console.error('Gemini fallback summary error:', err);
		}
	}

	return json({ error: 'Daily briefing unavailable' }, { status: 502 });
}
