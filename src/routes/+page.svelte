<script>
	import { onMount, tick } from 'svelte';
	import { parseInput, toGrams } from '$lib/parser.js';
	import { findFood, saveFood, bumpUsage, logMeal, getTodaysMeals, clearTodaysMeals, seedIfEmpty, getAllFoods, deleteMeal } from '$lib/db.js';
	import { SEED_FOODS } from '$lib/seeds.js';

	let input = $state('');
	let meals = $state([]); // { id, rawInput, items, logged_at }
	let status = $state(null); // { type: 'loading'|'error'|'success', message: '' }
	let dbCount = $state(0);
	let loading = $state(false);
	let theme = $state('system');
	
	let chatArea;

	let items = $derived(meals.flatMap(m => m.items));

	/* Calculate running totals and running item lists for each meal */
	let runningTotals = $derived.by(() => {
		const r = {};
		let current = { cal: 0, pro: 0, fat: 0, carbs: 0 };
		for (const meal of meals) {
			for (const item of meal.items) {
				current.cal += item.cal;
				current.pro += item.protein;
				current.fat += item.fat;
				current.carbs += item.carbs;
			}
			r[meal.id] = { ...current };
		}
		return r;
	});

	let runningItems = $derived.by(() => {
		const r = {};
		let accumulated = [];
		for (const meal of meals) {
			accumulated = [...accumulated, ...meal.items];
			r[meal.id] = [...accumulated];
		}
		return r;
	});
	let totals = $derived(
		items.reduce(
			(acc, item) => ({
				cal: round1(acc.cal + item.cal),
				protein: round1(acc.protein + item.protein),
				fat: round1(acc.fat + item.fat),
				carbs: round1(acc.carbs + item.carbs),
				fiber: round1(acc.fiber + item.fiber)
			}),
			{ cal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
		)
	);

	let today = $derived(
		new Date().toLocaleDateString('en-IN', {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		})
	);

	onMount(async () => {
		await seedIfEmpty(SEED_FOODS);
		await loadTodaysMeals();
		dbCount = (await getAllFoods()).length;

		const savedTheme = localStorage.getItem('theme');
		if (savedTheme) {
			theme = savedTheme;
			document.documentElement.setAttribute('data-theme', theme);
		}
	});

	function toggleTheme() {
		if (theme === 'system') {
			const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			theme = isDark ? 'light' : 'dark';
		} else {
			theme = theme === 'dark' ? 'light' : 'dark';
		}
		localStorage.setItem('theme', theme);
		document.documentElement.setAttribute('data-theme', theme);
	}

	async function loadTodaysMeals() {
		meals = await getTodaysMeals();
		scrollToBottom();
	}
	
	async function scrollToBottom() {
		await tick();
		if (chatArea) {
			chatArea.scrollTop = chatArea.scrollHeight;
		}
	}

	async function handleSubmit() {
		if (!input.trim() || loading) return;

		loading = true;
		status = { type: 'loading', message: 'analyzing...' };
		const rawInput = input;

		const parsed = parseInput(input);
		if (parsed.length === 0) {
			status = { type: 'error', message: 'could not parse input' };
			loading = false;
			return;
		}

		const newItems = [];
		const missed = [];

		for (const item of parsed) {
			try {
				let food = await findFood(item.name);
				let source = 'local';

				if (!food) {
					try {
						const res = await fetch('/api/lookup', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ food: item.name })
						});

						if (!res.ok) {
							missed.push(item.name);
							continue;
						}

						food = await res.json();
						food.id = await saveFood(food);
						source = 'gemini';
						dbCount = (await getAllFoods()).length;
					} catch (e) {
						if (!navigator.onLine) {
							status = { type: 'error', message: `You are offline! Connect just once to learn "${item.name}". After that, you can log it offline forever.` };
							loading = false;
							return;
						}
						missed.push(item.name);
						continue;
					}
				}

				if (!food || !food.per_100g) {
					missed.push(item.name);
					continue;
				}

				const grams = toGrams(item, food);
				const macros = food.per_100g;
				const factor = grams / 100;

				newItems.push({
					name: food.name,
					qty: item.qty,
					unit: item.unit,
					qty_g: Math.round(grams),
					cal: round1((macros.cal || 0) * factor),
					protein: round1((macros.protein || 0) * factor),
					fat: round1((macros.fat || 0) * factor),
					carbs: round1((macros.carbs || 0) * factor),
					fiber: round1((macros.fiber || 0) * factor),
					source
				});

				if (food.id) await bumpUsage(food.id);
			} catch (err) {
				missed.push(item.name);
			}
		}

		if (newItems.length > 0) {
			await logMeal(newItems, rawInput);
			await loadTodaysMeals();
		}

		if (missed.length > 0) {
			status = { type: 'error', message: 'missed: ' + missed.join(', ') };
		} else {
			status = null;
		}

		input = '';
		loading = false;
	}

	async function deleteMealEntry(id) {
		await deleteMeal(id);
		await loadTodaysMeals();
	}

	async function clearAll() {
		await clearTodaysMeals();
		await loadTodaysMeals();
		status = null;
	}

	function round1(n) {
		return Math.round(n * 10) / 10;
	}

	function handleKeydown(e) {
		if (e.key === 'Enter') handleSubmit();
	}
</script>

<!--
THESIS: A fast, text-driven macro ledger fully adopting the Material You design system.
OWN-WORLD: Material You Dark theme with a purple seed. Deep surface colors (#141218), large rounded corners (24px cards, 100px buttons), prominent tonal accents, and standard Roboto typography.
STORY: The visitor enters food in natural language and receives an immediate, beautifully structured Material card tracking their cumulative macros.
FIRST VIEWPORT: The top holds a clean 4-up metric dashboard in M3 surface containers. Below, a scrollable chat thread composed of distinct, deeply rounded M3 surface-container message bubbles. The bottom holds a pill-shaped input bar.
FORM: Material You (User-Pinned)
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->

<div class="app-layout">
	<header class="header">
		<div class="title-bar">
			<h1>iatethis</h1>
			<div style="display: flex; gap: 0.75rem; align-items: center;">
				<span class="meta">{today}</span>
				<button class="text-btn" style="padding: 0.25rem; font-size: 1.15rem;" onclick={toggleTheme} aria-label="Toggle theme">
					{#if theme === 'dark'}
						☀️
					{:else if theme === 'light'}
						🌙
					{:else}
						🌗
					{/if}
				</button>
			</div>
		</div>
		<div class="summary-dashboard">
			<div class="metric cal">
				<span class="label">Calories</span>
				<span class="value">{Math.round(totals.cal)}</span>
			</div>
			<div class="metric pro">
				<span class="label">Protein</span>
				<span class="value">{totals.protein}g</span>
			</div>
			<div class="metric fat">
				<span class="label">Fat</span>
				<span class="value">{totals.fat}g</span>
			</div>
			<div class="metric carb">
				<span class="label">Carbs</span>
				<span class="value">{totals.carbs}g</span>
			</div>
		</div>

	</header>

	<main class="log-area chat-area" bind:this={chatArea}>
		<div class="chat-thread">
			{#if meals.length === 0 && !loading}
				<div class="empty">
					<div>What did you eat today?</div>
					<div class="hint">try "200g chicken and 1 cup rice"</div>
				</div>
			{/if}

			{#each meals as meal (meal.id)}
				{#if meal.rawInput}
					<div class="chat-bubble user">
						{meal.rawInput}
					</div>
				{/if}

				<div class="chat-bubble system">
					<div class="reply-header">
						Added {meal.items.map(i => `${i.name} (${Math.round(i.cal)} cal, ${i.protein}g pro)`).join(', ')}. Here is your updated diet:
					</div>
					<table class="chat-table">
						<thead>
							<tr>
								<th>item</th>
								<th class="num">qty</th>
								<th class="num">cal</th>
								<th class="num">pro</th>
							</tr>
						</thead>
						<tbody>
							{#if runningItems[meal.id]}
								{#each runningItems[meal.id] as item}
								<tr>
									<td>{item.name}</td>
									<td class="num">
										{#if item.qty !== undefined}
											{item.qty}{item.unit === 'piece' || item.unit === 'serving' ? '' : item.unit}
										{:else}
											{item.qty_g}g
										{/if}
									</td>
									<td class="num">{Math.round(item.cal)}</td>
									<td class="num">{item.protein}g</td>
								</tr>
								{/each}
							{/if}
						</tbody>
					</table>
					{#if runningTotals[meal.id]}
					<div class="reply-total">
						Total: {Math.round(runningTotals[meal.id].cal)} cal, {Math.round(runningTotals[meal.id].pro)}g pro, {Math.round(runningTotals[meal.id].fat)}g fat
					</div>
					{/if}
					<div class="system-actions">
						<button class="text-btn" onclick={() => deleteMealEntry(meal.id)}>Undo Addition</button>
					</div>
				</div>
			{/each}
		</div>
	</main>

	<div class="input-section">
		{#if status}
			<div class="status {status.type}">{status.message}</div>
		{/if}
		<div class="input-row">
			<input
				type="text"
				bind:value={input}
				onkeydown={handleKeydown}
				placeholder="Message tracker..."
				aria-label="What did you eat?"
				disabled={loading}
			/>
			<button onclick={handleSubmit} disabled={loading || !input.trim()}>
				{loading ? '...' : 'send'}
			</button>
		</div>
	</div>
</div>
