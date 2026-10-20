import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const CLOUDFLARE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are an elite nutritional telemetry engine (tone like Whoop, Oura, or Garmin).
You output cold, high-precision analytical observations from food and macro telemetry.

OUTPUT FORMAT:
Line 1: A bold 4 to 8 word telemetry pattern headline (no asterisks, no quotes).
Line 2: An empty line.
Line 3: Exactly 2 concise, analytical observation sentences.

Format Examples:
Line 1: Carbs Leading Protein 3:1 Ratio

Line 3: Roti and dal drove the majority of calories, keeping protein density moderate at 19% of macro intake. Eggs provided the primary lean protein anchor, leaving 120g needed to hit target.

Line 1: High Fat Density, Minimal Protein Volume

Line 3: Samosa and sweet tea pushed fat intake to 60% of daily allowance with negligible protein. Carbohydrates and fats currently account for over 85% of total consumed energy.

STRICT TELEMETRY RULES:
1. ZERO ADVICE, ZERO HOMEWORK: Never say "consider", "you should", "try adding", "remember to", "to meet your goals", "to support", or "make sure to". Never prescribe recipes or meal plans.
2. ZERO CHATBOT FLUFF: Never say "good job", "off to a solid start", "great choice", or "unfortunately". No cheerleading, no apologies.
3. COLD OBSERVATION ONLY:
   - Sentence 1: State the food composition and macro driver (mention specific logged items like dal, roti, eggs, rice, etc.).
   - Sentence 2: State the pacing reality, macro density, or trade-off (e.g. fat margin, protein efficiency, or end-of-day closure).
4. Direct, factual, high-signal language. No filler words.`;

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

	// Telemetry calculations
	const proteinCal = totals.protein * 4;
	const carbCal = totals.carbs * 4;
	const fatCal = totals.fat * 9;
	const totalMacroCal = proteinCal + carbCal + fatCal || 1;
	const proteinSplitPct = Math.round((proteinCal / totalMacroCal) * 100);
	const carbSplitPct = Math.round((carbCal / totalMacroCal) * 100);
	const fatSplitPct = Math.round((fatCal / totalMacroCal) * 100);
	const proteinDensity = totals.cal > 0 ? (totals.protein / (totals.cal / 100)).toFixed(1) : '0';
	const fatTargetPct = Math.round((totals.fat / targetFat) * 100);
	const proteinTargetPct = Math.round((totals.protein / targetProtein) * 100);

	let telemetryData = `Phase: ${time?.period ? time.period.toUpperCase() : 'DAY'} (${time?.formatted || ''})\n`;
	telemetryData += `Target Objective: ${profile?.objective ? profile.objective.replace('_', ' ') : 'maintenance'} (daily protein target: ${targetProtein}g)\n`;
	telemetryData += `Today's Totals: ${totals.protein}g protein, ${totals.fat}g fat, ${totals.carbs}g carbs, ${Math.round(totals.cal)} kcal\n`;
	telemetryData += `Macro Breakdown: ${proteinSplitPct}% protein, ${carbSplitPct}% carbs, ${fatSplitPct}% fat (${proteinDensity}g protein per 100 kcal)\n`;
	telemetryData += `Fat Budget Used: ${fatTargetPct}%\n`;

	if (week && week.days_tracked > 1 && week.avg_protein) {
		telemetryData += `- 7-Day Baseline: ${week.avg_cal} kcal, ${week.avg_protein}g protein\n`;
	}

	const prompt = `${telemetryData}
Logged Foods:
${foodList}

Generate objective telemetry brief:`;

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
