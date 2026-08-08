<script>
	import { onMount } from 'svelte';
	import { parseInput, toGrams } from '$lib/parser.js';
	import { findFood, saveFood, bumpUsage, logMeal, getTodaysMeals, clearTodaysMeals, seedIfEmpty, getAllFoods } from '$lib/db.js';
	import { SEED_FOODS } from '$lib/seeds.js';

	let input = $state('');
	let items = $state([]); // [{ name, qty_g, cal, protein, fat, carbs, fiber }]
	let status = $state(null); // { type: 'loading'|'error'|'success', message: '' }
	let dbCount = $state(0);
	let loading = $state(false);
	let summary = $state('');
	let summaryLoading = $state(false);

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
		const meals = await getTodaysMeals();
		items = meals.flatMap(m => m.items);
	}

	async function handleSubmit() {
		if (!input.trim() || loading) return;

		loading = true;
		status = { type: 'loading', message: 'looking up...' };

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
							const err = await res.json().catch(() => ({}));
							missed.push(item.name + ': ' + (err.error || 'lookup failed'));
							continue;
						}

						food = await res.json();
						food.id = await saveFood(food);
						source = 'gemini';
						dbCount = (await getAllFoods()).length;
					} catch (e) {
						missed.push(item.name + ': network error');
						continue;
					}
				}

				if (!food || !food.per_100g) {
					missed.push(item.name + ': invalid data');
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
				console.error('Error processing item:', item, err);
				missed.push(item.name + ': internal error');
			}
		}

		if (newItems.length > 0) {
			items = [...items, ...newItems];
			await logMeal(newItems);
		}

		if (missed.length > 0) {
			status = { type: 'error', message: 'missed: ' + missed.join(', ') };
		} else {
			status = { type: 'success', message: newItems.map(i => i.name).join(', ') + ' added' };
			setTimeout(() => { status = null; }, 3000);
		}

		input = '';
		loading = false;
		fetchSummary();
	}

	async function fetchSummary() {
		if (items.length === 0) { summary = ''; return; }
		summaryLoading = true;
		try {
			const res = await fetch('/api/summary', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items, totals })
			});
			if (res.ok) {
				const data = await res.json();
				summary = data.summary || '';
			}
		} catch (e) {
			/* silent fail, summary is optional */
		}
		summaryLoading = false;
	}

	function removeItem(index) {
		items = items.filter((_, i) => i !== index);
		clearTodaysMeals().then(() => logMeal(items));
	}

	async function clearAll() {
		items = [];
		await clearTodaysMeals();
		status = null;
	}

	function round1(n) {
		return Math.round(n * 10) / 10;
	}

	function handleKeydown(e) {
		if (e.key === 'Enter') handleSubmit();
	}
</script>

<div class="container">
	<header class="header">
		<h1>iatethis</h1>
		<span class="meta">{today}</span>
	</header>

	{#if items.length > 0}
		<div class="summary">
			<div class="summary-card">
				<div class="label">cal</div>
				<div class="value">{Math.round(totals.cal)}</div>
			</div>
			<div class="summary-card">
				<div class="label">protein</div>
				<div class="value">{totals.protein}<span class="unit">g</span></div>
			</div>
			<div class="summary-card">
				<div class="label">fat</div>
				<div class="value">{totals.fat}<span class="unit">g</span></div>
			</div>
			<div class="summary-card">
				<div class="label">carbs</div>
				<div class="value">{totals.carbs}<span class="unit">g</span></div>
			</div>
			<div class="summary-card">
				<div class="label">fiber</div>
				<div class="value">{totals.fiber}<span class="unit">g</span></div>
			</div>
		</div>
	{/if}

	<div class="input-section">
		<div class="input-row">
			<input
				type="text"
				bind:value={input}
				onkeydown={handleKeydown}
				placeholder="200g chicken, 2 roti, dal 1 bowl"
				disabled={loading}
			/>
			<button onclick={handleSubmit} disabled={loading || !input.trim()}>
				{loading ? 'looking up...' : 'add'}
			</button>
		</div>
		<div class="input-hint">comma-separated. quantities in grams, pieces, cups, bowls, etc.</div>
	</div>

	{#if status}
		<div class="status {status.type}">{status.message}</div>
	{/if}

	{#if items.length > 0}
		<div class="table-section">
			<div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem;">
				<h2>today</h2>
				<button class="remove-btn" style="font-size: 0.75rem; color: var(--text-dim); background: none; border: none; cursor: pointer;" onclick={clearAll}>
					clear all
				</button>
			</div>
			<table class="meal-table">
				<thead>
					<tr>
						<th></th>
						<th>food</th>
						<th class="num">qty</th>
						<th class="num">cal</th>
						<th class="num">protein</th>
						<th class="num">fat</th>
						<th class="num">carbs</th>
						<th class="num">fiber</th>
					</tr>
				</thead>
				<tbody>
					{#each items as item, i}
						<tr>
							<td>
								<button class="remove-btn" onclick={() => removeItem(i)}>x</button>
							</td>
							<td class="food-name">{item.name}</td>
							<td class="qty">{item.qty_g}g</td>
							<td class="num">{Math.round(item.cal)}</td>
							<td class="num">{item.protein}</td>
							<td class="num">{item.fat}</td>
							<td class="num">{item.carbs}</td>
							<td class="num">{item.fiber}</td>
						</tr>
					{/each}
					<tr class="total-row">
						<td></td>
						<td>total</td>
						<td></td>
						<td class="num">{Math.round(totals.cal)}</td>
						<td class="num">{totals.protein}</td>
						<td class="num">{totals.fat}</td>
						<td class="num">{totals.carbs}</td>
						<td class="num">{totals.fiber}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div class="text-summary">
			{#if summaryLoading}
				<p class="summary-loading">thinking...</p>
			{:else if summary}
				<p>{summary}</p>
			{:else}
				<p>
					{items.length} item{items.length === 1 ? '' : 's'} logged —
					{Math.round(totals.cal)} cal,
					{totals.protein}g protein,
					{totals.fat}g fat,
					{totals.carbs}g carbs,
					{totals.fiber}g fiber.
				</p>
			{/if}
		</div>
	{:else}
		<div class="empty">
			<div>nothing logged yet</div>
			<div class="hint">type what you ate above</div>
		</div>
	{/if}

	<footer class="footer">
		<span>foods known: <span class="db-count">{dbCount}</span></span>
		<span>new foods fetched via gemini, cached locally</span>
	</footer>
</div>
