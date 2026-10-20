import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const CLOUDFLARE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are an elite, perceptive sports nutritionist writing a concise daily briefing directly to the user (second-person 'you', editorial tone like Whoop or Apple Health).
The user logs meals progressively throughout the day as they eat.

Write a briefing in this EXACT 2-part format:
Line 1: A bold 4 to 8 word headline summarizing the food composition or nutrient highlight (no asterisks).
Line 2: An empty line.
Line 3: Exactly 2 intelligent sentences evaluating the actual food choices so far and recommending specific food adjustments for the next meal.

Format Example:
Line 1: Clean Protein Base With Steady Complex Carbs

Line 3: Your eggs and dal provided a solid start on protein, while roti delivered steady complex energy. To keep momentum toward your muscle gain target, pair a lean protein like Greek yogurt, paneer, or chicken with leafy greens for your next meal.

STRICT RULES:
1. NEVER do subtraction math or recite 'you are X calories below target' or 'inadequate calories'. The user is logging progressively throughout the day.
2. Focus on FOOD QUALITY: mention 1 or 2 specific foods logged (e.g. eggs, dal, roti, oats, paneer, chicken, rice) and what they contributed (lean protein, clean carbs, healthy fats, fiber).
3. Suggest specific realistic foods (e.g. chana, paneer, Greek yogurt, chicken breast, roasted vegetables) to balance their next meal based on what macro is still needed.
4. Calm, direct, smart tone. No cheerleading, no emojis.`;

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request, platform }) {
	const { items, totals, profile, week } = await request.json();

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

	let userContext = '';
	if (profile?.objective) {
		userContext += `Target Objective: ${profile.objective.replace('_', ' ')} (daily protein target: ~${targetProtein}g).\n`;
	}

	if (week && week.days_tracked > 1 && week.avg_protein) {
		userContext += `Weekly baseline: ${week.avg_cal} kcal, ${week.avg_protein}g protein (${week.days_tracked} days tracked).\n`;
	}

	const prompt = `${userContext}
Foods logged so far today:
${foodList}

Macronutrients logged so far: ${totals.protein}g protein, ${totals.fat}g fat, ${totals.carbs}g carbs, ${totals.fiber}g fiber.

Analyze the specific foods logged above. What did these foods provide, and what specific food should be eaten next to support their ${profile?.objective?.replace('_', ' ') || 'fitness'} goals?`;

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
