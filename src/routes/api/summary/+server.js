import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const CLOUDFLARE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are a concise nutrition analyst. Given a person's food log, their target goals, and their week's progress, write a daily briefing in this EXACT 2-part format:
Line 1: A bold, punchy headline in 4 to 8 words summarizing today's status (like an Apple Health or Fitbit insight). No quotes, no asterisks, no prefix.
Line 2: An empty line.
Line 3: 2 concise, actionable sentences evaluating today against their specific target goals and giving one takeaway for the rest of the day.

Rules:
- Respect their explicit goals (do not recommend generic gym targets if their goal says otherwise).
- If only 1 day has been tracked, focus strictly on today vs their goal (do not assume past trends).
- If multiple days are tracked, you may highlight consistency, improvements, or streaks.
- Professional, direct, calm tone. No cheerleading, no emojis, no boilerplate intros.`;

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request, platform }) {
	const { items, totals, profile, week } = await request.json();

	if (!items || !items.length) {
		return json({ error: 'No items to summarize' }, { status: 400 });
	}

	const foodList = items.map(i => `- ${i.name}: ${i.qty_g}g (${Math.round(i.cal)} kcal, ${i.protein}g P, ${i.fat}g F, ${i.carbs}g C, ${i.fiber}g fiber)`).join('\n');

	// Construct contextual prompt
	let userContext = '';
	if (profile) {
		const objLabel = profile.objective ? ` (Objective: ${profile.objective.replace('_', ' ')})` : '';
		userContext += `User Goal: ${profile.goals?.cal || 2000} kcal, ${profile.goals?.protein || 140}g protein, ${profile.goals?.fat || 60}g fat, ${profile.goals?.carbs || 200}g carbs${objLabel}.\n`;
	}

	if (week) {
		const daysTracked = week.days_tracked || 1;
		userContext += `Tracking History: ${daysTracked} day(s) logged this week.`;
		if (daysTracked > 1 && week.avg_protein) {
			userContext += ` Week average: ${week.avg_cal} kcal, ${week.avg_protein}g protein. Active streak: ${week.streak || 0} days.`;
		}
		userContext += '\n';
	}

	const prompt = `${userContext}
Today's food log:
${foodList}

Today's Totals: ${Math.round(totals.cal)} kcal, ${totals.protein}g protein, ${totals.fat}g fat, ${totals.carbs}g carbs, ${totals.fiber}g fiber.

Provide today's brief:`;

	// 1. Primary: Cloudflare Workers AI with streaming
	if (platform?.env?.AI) {
		try {
			const stream = await platform.env.AI.run(CLOUDFLARE_MODEL, {
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: prompt }
				],
				temperature: 0.4,
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
						temperature: 0.5,
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
