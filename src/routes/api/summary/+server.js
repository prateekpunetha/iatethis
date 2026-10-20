import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const CLOUDFLARE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are an elite, perceptive sports nutritionist writing a concise daily briefing directly to the user (second-person 'you', editorial tone like Whoop or Apple Health).

Write a daily brief in this EXACT 2-part format:
Line 1: A bold 4 to 8 word headline highlighting nutritional quality, pacing, or macro composition (NO asterisks, NO quotes).
Line 2: An empty line.
Line 3: Exactly 2 intelligent, observant sentences.

High-IQ Nutrition Guidelines:
1. TIME OF DAY AWARENESS:
   - Morning: Review breakfast foundation for energy and satiety.
   - Afternoon: Evaluate lunch balance, check if carbs/fats are outrunning protein, and guide evening.
   - Evening: Focus on dinner balance to hit remaining targets cleanly.
   - Night: Treat as an end-of-day debrief! Review the full day's nutritional quality. Do NOT suggest another full meal at night.
2. NUTRITIONAL REALISM (Dual-Macro Awareness):
   - Recognize that lentils/dal/chana are carbohydrate-rich with moderate protein (not pure protein). Nuts are fat-dense. Paneer is protein with high saturated fat.
   - Point out macro tradeoffs (e.g. if carbs or fats are scaling faster than protein).
3. CUISINE & PANTRY REALISM:
   - Match recommendations to the user's cuisine: if they eat Indian home food (dal, roti, rice, sabzi), recommend realistic staples like dahi/curd, paneer, eggs, sprouts chaat, soya chunks, roasted chana, or whey.
   - Never recommend generic fitness clichés (like "steamed broccoli and chicken breast") unless already logged.
4. TONE & STRUCTURE:
   - Avoid monotonous templates ("Your X gave Y, while Z gave W").
   - Never recite dry subtraction math (e.g. never say "you are X kcal below target").
   - Direct, calm, sharp tone. No cheerleading, no emojis.`;

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request, platform }) {
	const { items, totals, profile, week, time } = await request.json();

	if (!items || !items.length) {
		return json({ error: 'No items to summarize' }, { status: 400 });
	}

	const foodList = items.map(i => `- ${i.name}: ${i.qty_g}g (${Math.round(i.cal)} kcal, ${i.protein}g P, ${i.fat}g F, ${i.carbs}g C, ${i.fiber}g fiber)`).join('\n');

	// Construct contextual prompt
	const targetCal = profile?.goals?.cal || 2000;
	const targetProtein = profile?.goals?.protein || 140;
	const targetFat = profile?.goals?.fat || 60;
	const targetCarbs = profile?.goals?.carbs || 200;
	const targetFiber = profile?.goals?.fiber || 30;

	let timeContext = '';
	if (time?.period) {
		const periodLabel = time.period === 'night' 
			? 'NIGHT / END OF DAY (Day is finished — provide an end-of-day nutritional wrap-up, do not suggest another meal)' 
			: `${time.period.toUpperCase()} (${time.formatted || ''}) — Day is active`;
		timeContext = `Current Time: ${periodLabel}\n`;
	}

	let userContext = timeContext;
	if (profile?.objective) {
		userContext += `Target Objective: ${profile.objective.replace('_', ' ')} (daily protein target: ~${targetProtein}g, budget: ~${targetCal} kcal).\n`;
	}

	if (week && week.days_tracked > 1 && week.avg_protein) {
		userContext += `Weekly baseline: ${week.avg_cal} kcal, ${week.avg_protein}g protein (${week.days_tracked} days tracked).\n`;
	}

	const prompt = `${userContext}
Foods logged today:
${foodList}

Macronutrients logged so far: ${totals.protein}g protein, ${totals.fat}g fat, ${totals.carbs}g carbs, ${totals.fiber}g fiber.

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
