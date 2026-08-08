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
	
	let chatArea;

	let items = $derived(meals.flatMap(m => m.items));
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
	});

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

<div class="app-layout">
	<header class="header">
		<div class="title-bar">
			<h1>iatethis</h1>
			<span class="meta">{today}</span>
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
		{#if meals.length > 0}
			<div class="chat-thread">
				<div class="chat-intro">Tracker started. Log your meals below.</div>
				{#each meals as meal}
					<div class="chat-bubble user">
						{meal.rawInput || 'Logged items'}
					</div>
					<div class="chat-bubble system">
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
								{#each meal.items as item}
								<tr>
									<td>{item.name}</td>
									<td class="num">{item.qty_g}g</td>
									<td class="num">{Math.round(item.cal)}</td>
									<td class="num">{item.protein}g</td>
								</tr>
								{/each}
							</tbody>
						</table>
						<div class="system-actions">
							<button class="text-btn" onclick={() => deleteMealEntry(meal.id)}>delete</button>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="empty">
				<div>what did you eat today?</div>
				<div class="hint">try "200g chicken and 1 cup rice"</div>
			</div>
		{/if}
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
