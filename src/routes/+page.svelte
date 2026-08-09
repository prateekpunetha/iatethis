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
	let theme = $state('dark');

	/* Macro goals (daily targets) */
	const goals = {
		cal: 2200,
		protein: 150,
		carbs: 200,
		fat: 80,
		fiber: 30
	};

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

	let remaining = $derived(Math.max(0, Math.round(goals.cal - totals.cal)));

	/* Progress ring calculations */
	const ringRadius = 54;
	const ringCircumference = 2 * Math.PI * ringRadius;
	let ringOffset = $derived(() => {
		const progress = Math.min(totals.cal / goals.cal, 1);
		return ringCircumference - (progress * ringCircumference);
	});

	let today = $derived(
		new Date().toLocaleDateString('en-IN', {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		})
	);

	/* Meal icons to cycle through */
	const mealIcons = ['local_cafe', 'breakfast_dining', 'lunch_dining', 'dinner_dining', 'restaurant', 'bakery_dining'];
	const mealColors = ['primary', 'secondary', 'tertiary', 'primary', 'secondary', 'tertiary'];

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
		theme = theme === 'dark' ? 'light' : 'dark';
		localStorage.setItem('theme', theme);
		document.documentElement.setAttribute('data-theme', theme);
	}

	async function loadTodaysMeals() {
		meals = await getTodaysMeals();
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

	function formatQty(item) {
		if (item.qty !== undefined) {
			const unit = item.unit === 'piece' || item.unit === 'serving' ? '' : item.unit;
			return `${item.qty}${unit ? ' ' + unit : ''}`;
		}
		return `${item.qty_g}g`;
	}
</script>

<div class="app-layout">
	<!-- Top App Bar -->
	<header class="header">
		<div class="header-left">
			<button class="icon-btn" style="color: var(--on-surface-variant);">
				<span class="material-symbols-outlined">menu</span>
			</button>
			<h1>iatethis</h1>
		</div>
		<div class="header-right">
			<span class="header-date">{today}</span>
			<button class="icon-btn" style="color: var(--tertiary);" onclick={toggleTheme} aria-label="Toggle theme">
				<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">
					{theme === 'dark' ? 'wb_sunny' : 'dark_mode'}
				</span>
			</button>
		</div>
	</header>

	<main class="main-content">
		<!-- Progress Ring -->
		<section class="ring-section">
			<div class="ring-container">
				<svg class="ring-svg" viewBox="0 0 120 120">
					<!-- Background track -->
					<circle
						class="ring-track"
						cx="60" cy="60" r={ringRadius}
					></circle>
					<!-- Progress arc -->
					<circle
						class="ring-progress"
						cx="60" cy="60" r={ringRadius}
						stroke-dasharray={ringCircumference}
						stroke-dashoffset={ringOffset()}
					></circle>
				</svg>
				<div class="ring-center">
					<span class="ring-label">Remaining</span>
					<span class="ring-value">{remaining.toLocaleString()}</span>
					<span class="ring-unit">kcal</span>
				</div>
			</div>
			<div class="ring-summary">
				<div class="ring-summary-item">
					<span class="ring-summary-label">Goal</span>
					<span class="ring-summary-value">{goals.cal.toLocaleString()}</span>
				</div>
				<div class="ring-summary-divider"></div>
				<div class="ring-summary-item">
					<span class="ring-summary-label">Food</span>
					<span class="ring-summary-value">{Math.round(totals.cal).toLocaleString()}</span>
				</div>
			</div>
		</section>

		<!-- Macro Cards Grid -->
		<section class="macro-grid">
			<!-- Protein -->
			<div class="macro-card protein">
				<div class="macro-card-header">
					<span class="macro-card-label">Protein</span>
					<span class="material-symbols-outlined macro-card-icon">fitness_center</span>
				</div>
				<div class="macro-card-value">
					<span class="macro-card-number">{Math.round(totals.protein)}</span>
					<span class="macro-card-goal">/ {goals.protein}g</span>
				</div>
				<div class="macro-bar-track">
					<div class="macro-bar-fill" style="width: {Math.min(100, (totals.protein / goals.protein) * 100)}%"></div>
				</div>
			</div>

			<!-- Carbs -->
			<div class="macro-card carbs">
				<div class="macro-card-header">
					<span class="macro-card-label">Carbs</span>
					<span class="material-symbols-outlined macro-card-icon">bolt</span>
				</div>
				<div class="macro-card-value">
					<span class="macro-card-number">{Math.round(totals.carbs)}</span>
					<span class="macro-card-goal">/ {goals.carbs}g</span>
				</div>
				<div class="macro-bar-track">
					<div class="macro-bar-fill" style="width: {Math.min(100, (totals.carbs / goals.carbs) * 100)}%"></div>
				</div>
			</div>

			<!-- Fat -->
			<div class="macro-card fat">
				<div class="macro-card-header">
					<span class="macro-card-label">Fat</span>
					<span class="material-symbols-outlined macro-card-icon">water_drop</span>
				</div>
				<div class="macro-card-value">
					<span class="macro-card-number">{Math.round(totals.fat)}</span>
					<span class="macro-card-goal">/ {goals.fat}g</span>
				</div>
				<div class="macro-bar-track">
					<div class="macro-bar-fill" style="width: {Math.min(100, (totals.fat / goals.fat) * 100)}%"></div>
				</div>
			</div>

			<!-- Fiber -->
			<div class="macro-card fiber">
				<div class="macro-card-header">
					<span class="macro-card-label">Fiber</span>
					<span class="material-symbols-outlined macro-card-icon">grass</span>
				</div>
				<div class="macro-card-value">
					<span class="macro-card-number">{Math.round(totals.fiber)}</span>
					<span class="macro-card-goal">/ {goals.fiber}g</span>
				</div>
				<div class="macro-bar-track">
					<div class="macro-bar-fill" style="width: {Math.min(100, (totals.fiber / goals.fiber) * 100)}%"></div>
				</div>
			</div>
		</section>

		<!-- Chat Input -->
		<section class="chat-input-section">
			{#if status}
				<div class="status-bar {status.type}">{status.message}</div>
			{/if}
			<div class="glass-input">
				<div class="input-icon-wrap">
					<span class="material-symbols-outlined">add_comment</span>
				</div>
				<input
					type="text"
					bind:value={input}
					onkeydown={handleKeydown}
					placeholder="I ate 349 ml sugarcane juice..."
					aria-label="What did you eat?"
					disabled={loading}
				/>
				<button class="send-btn" onclick={handleSubmit} disabled={loading || !input.trim()}>
					<span class="material-symbols-outlined">send</span>
				</button>
			</div>
		</section>

		<!-- Today's Log -->
		{#if meals.length > 0}
			<section class="log-card">
				<h2 class="log-card-title">Today's Log</h2>
				<div class="log-entries">
					{#each meals as meal, mealIdx (meal.id)}
						{#each meal.items as item, itemIdx}
							<div class="log-entry" style="animation-delay: {(mealIdx * meal.items.length + itemIdx) * 50}ms">
								<div class="log-entry-left">
									<div class="log-entry-icon" style="color: var(--{mealColors[(mealIdx + itemIdx) % mealColors.length]});">
										<span class="material-symbols-outlined">{mealIcons[(mealIdx + itemIdx) % mealIcons.length]}</span>
									</div>
									<div>
										<div class="log-entry-name">{item.name}</div>
										<div class="log-entry-qty">{formatQty(item)}</div>
									</div>
								</div>
								<div class="log-entry-actions">
									<div class="log-entry-right">
										<div class="log-entry-cal">
											{Math.round(item.cal)} <span class="log-entry-cal-unit">kcal</span>
										</div>
									</div>
									{#if itemIdx === 0}
										<button class="log-entry-delete" onclick={() => deleteMealEntry(meal.id)} aria-label="Delete meal">
											<span class="material-symbols-outlined">close</span>
										</button>
									{/if}
								</div>
							</div>
						{/each}
					{/each}
				</div>
				{#if meals.length > 3}
					<button class="view-full-log-btn">View Full Log</button>
				{/if}
			</section>
		{:else if !loading}
			<section class="empty-state">
				<div class="empty-state-icon">
					<span class="material-symbols-outlined">restaurant</span>
				</div>
				<div class="empty-state-title">What did you eat today?</div>
				<div class="empty-state-hint">Try "200g chicken and 1 cup rice"</div>
			</section>
		{/if}
	</main>

	<!-- Bottom Navigation Bar -->
	<nav class="bottom-nav">
		<button class="nav-btn active" aria-label="Daily">
			<span class="material-symbols-outlined">dashboard</span>
			<span class="nav-btn-label">Daily</span>
		</button>
		<button class="nav-btn" aria-label="Log">
			<span class="material-symbols-outlined">list_alt</span>
			<span class="nav-btn-label">Log</span>
		</button>
		<button class="nav-btn" aria-label="Insights">
			<span class="material-symbols-outlined">insights</span>
			<span class="nav-btn-label">Insights</span>
		</button>
		<button class="nav-btn" aria-label="Profile">
			<span class="material-symbols-outlined">person</span>
			<span class="nav-btn-label">Profile</span>
		</button>
	</nav>
</div>
