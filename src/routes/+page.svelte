<script>
	import { onMount, tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { parseInput, toGrams } from '$lib/parser.js';
	import { findFood, saveFood, bumpUsage, logMeal, getTodaysMeals, clearTodaysMeals, seedIfEmpty, getAllFoods, deleteMeal, deleteMealItem, getAllMeals, getFrequentFoods, searchFoods, getMealsForDays } from '$lib/db.js';
	import { SEED_FOODS } from '$lib/seeds.js';

	/** Get local date string YYYY-MM-DD */
	function getLocalDateStr(date = new Date()) {
		return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
	}

	let input = $state('');
	let meals = $state([]); // { id, rawInput, items, logged_at }
	let status = $state(null); // { type: 'loading'|'error'|'success', message: '' }
	let dbCount = $state(0);
	let loading = $state(false);
	let removingItems = $state(new Set());
	let theme = $state('dark');
	let activeTab = $state('daily');

	/* Log tab state */
	let searchQuery = $state('');
	let searchResults = $state([]);
	let recentMeals = $state([]);
	let frequentFoods = $state([]);
	let searching = $state(false);
	let expandedDate = $state(null); // which date card is expanded

	/* PWA Install state */
	let deferredPrompt = null;
	let showInstallBanner = $state(false);

	/* Drawer state */
	let isDrawerOpen = $state(false);

	/* Insights tab state */
	let insightsMeals = $state([]);

	let insightsData = $derived.by(() => {
		const now = new Date();
		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		
		// Build last 7 days
		const days = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			const dateStr = getLocalDateStr(d);
			days.push({ label: dayNames[d.getDay()], date: dateStr, cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
		}
		
		// Fill in data from meals
		for (const meal of insightsMeals) {
			const mealDate = meal.date || getLocalDateStr(new Date(meal.logged_at));
			const day = days.find(d => d.date === mealDate);
			if (day) {
				for (const item of meal.items) {
					day.cal += item.cal || 0;
					day.protein += item.protein || 0;
					day.carbs += item.carbs || 0;
					day.fat += item.fat || 0;
					day.fiber += item.fiber || 0;
				}
			}
		}
		
		// Compute aggregates
		const daysWithData = days.filter(d => d.cal > 0);
		const totalDays = daysWithData.length || 1;
		const avgCal = Math.round(daysWithData.reduce((s, d) => s + d.cal, 0) / totalDays);
		const avgProtein = Math.round(daysWithData.reduce((s, d) => s + d.protein, 0) / totalDays);
		const maxCal = Math.max(...days.map(d => d.cal), 1);
		
		// Macro totals for donut
		const totalProtein = daysWithData.reduce((s, d) => s + d.protein, 0);
		const totalCarbs = daysWithData.reduce((s, d) => s + d.carbs, 0);
		const totalFat = daysWithData.reduce((s, d) => s + d.fat, 0);
		const macroTotal = totalProtein + totalCarbs + totalFat || 1;
		
		// Days where calorie goal was met
		const targetsHit = daysWithData.filter(d => d.cal >= goals.cal * 0.8).length;
		
		// Streak (consecutive days with data from today backwards)
		let streak = 0;
		for (let i = days.length - 1; i >= 0; i--) {
			if (days[i].cal > 0) streak++;
			else break;
		}
		
		// Top food
		const foodCounts = {};
		for (const meal of insightsMeals) {
			for (const item of meal.items) {
				foodCounts[item.name] = (foodCounts[item.name] || 0) + 1;
			}
		}
		const topFood = Object.entries(foodCounts).sort((a, b) => b[1] - a[1])[0];
		
		// Date range label
		const startDate = new Date(days[0].date);
		const endDate = new Date(days[6].date);
		const dateRange = `${startDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`;
		
		return {
			days,
			avgCal,
			avgProtein,
			maxCal,
			proteinPct: Math.round((totalProtein / macroTotal) * 100),
			carbsPct: Math.round((totalCarbs / macroTotal) * 100),
			fatPct: Math.round((totalFat / macroTotal) * 100),
			targetsHit,
			totalDays,
			streak,
			topFood: topFood ? topFood[0] : '—',
			dateRange
		};
	});

	/* Macro goals (daily targets) — loaded from localStorage */
	const defaultGoals = { cal: 2800, protein: 150, carbs: 300, fat: 80, fiber: 30 };
	let goals = $state({ ...defaultGoals });

	/* Profile state */
	let profileName = $state('You');
	let profileObjective = $state('maintenance'); // 'muscle_gain' | 'fat_loss' | 'maintenance'
	let profileWeight = $state(70);
	let profileTargetWeight = $state(70);
	let profileSaved = $state(false);
	let profilePicture = $state(null);

	/* Macro slider percentages */
	let proteinPct = $state(30);
	let carbsPct = $state(40);
	let fatPct = $state(30);

	/* Derived gram values from calorie target + percentages */
	let proteinGrams = $derived(Math.round((goals.cal * (proteinPct / 100)) / 4));
	let carbsGrams = $derived(Math.round((goals.cal * (carbsPct / 100)) / 4));
	let fatGrams = $derived(Math.round((goals.cal * (fatPct / 100)) / 9));

	function loadProfile() {
		try {
			const saved = localStorage.getItem('iatethis_profile');
			if (saved) {
				const p = JSON.parse(saved);
				goals = { ...defaultGoals, ...p.goals };
				profileName = p.name || 'You';
				profileObjective = p.objective || 'maintenance';
				profileWeight = p.weight || 70;
				profileTargetWeight = p.targetWeight || 70;
				proteinPct = p.proteinPct || 30;
				carbsPct = p.carbsPct || 40;
				fatPct = p.fatPct || 30;
				profilePicture = p.profilePicture || null;
			}
		} catch (e) { /* ignore corrupt data */ }
	}

	function saveProfile() {
		/* Recalculate macro gram goals from percentages */
		goals.protein = proteinGrams;
		goals.carbs = carbsGrams;
		goals.fat = fatGrams;

		const profile = {
			goals: { ...goals },
			name: profileName,
			objective: profileObjective,
			weight: profileWeight,
			targetWeight: profileTargetWeight,
			profilePicture,
			proteinPct,
			carbsPct,
			fatPct
		};
		localStorage.setItem('iatethis_profile', JSON.stringify(profile));
		profileSaved = true;
		setTimeout(() => profileSaved = false, 2000);
	}

	function handleProfileUpload(e) {
		const file = e.target.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (event) => {
			profilePicture = event.target.result;
			saveProfile();
		};
		reader.readAsDataURL(file);
	}

	/* Adjust sliders so they always sum to 100 */
	function adjustSlider(changed) {
		if (changed === 'protein') {
			const remaining = 100 - proteinPct;
			const oldOther = carbsPct + fatPct || 1;
			carbsPct = Math.round((carbsPct / oldOther) * remaining);
			fatPct = 100 - proteinPct - carbsPct;
		} else if (changed === 'carbs') {
			const remaining = 100 - carbsPct;
			const oldOther = proteinPct + fatPct || 1;
			proteinPct = Math.round((proteinPct / oldOther) * remaining);
			fatPct = 100 - proteinPct - carbsPct;
		} else {
			const remaining = 100 - fatPct;
			const oldOther = proteinPct + carbsPct || 1;
			proteinPct = Math.round((proteinPct / oldOther) * remaining);
			carbsPct = 100 - proteinPct - fatPct;
		}
	}

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

	/* Meal icons to cycle through */
	const mealIcons = ['local_cafe', 'breakfast_dining', 'lunch_dining', 'dinner_dining', 'restaurant', 'bakery_dining'];
	const mealColors = ['primary', 'secondary', 'tertiary', 'primary', 'secondary', 'tertiary'];

	/* Food category icons */
	const foodIcons = {
		default: 'restaurant',
		coffee: 'coffee',
		tea: 'emoji_food_beverage',
		egg: 'egg_alt',
		chicken: 'kebab_dining',
		meat: 'kebab_dining',
		beef: 'kebab_dining',
		mutton: 'kebab_dining',
		fish: 'set_meal',
		prawn: 'set_meal',
		rice: 'rice_bowl',
		bread: 'bakery_dining',
		roti: 'bakery_dining',
		naan: 'bakery_dining',
		milk: 'water_drop',
		curd: 'soup_kitchen',
		yogurt: 'soup_kitchen',
		cheese: 'local_pizza',
		paneer: 'local_pizza',
		fruit: 'eco',
		apple: 'eco',
		banana: 'eco',
		mango: 'eco',
		pizza: 'local_pizza',
		protein: 'fitness_center',
		whey: 'fitness_center',
		dal: 'soup_kitchen',
		soup: 'soup_kitchen',
		salad: 'eco',
		vegetable: 'eco',
		aloo: 'eco',
		palak: 'eco',
		water: 'water_drop',
		drink: 'local_drink',
		juice: 'local_drink',
		cake: 'cake',
		sweet: 'cake',
		icecream: 'icecream'
	};

	function getFoodIcon(item) {
		const lower = (item.name || '').toLowerCase();
		for (const [key, icon] of Object.entries(foodIcons)) {
			if (key !== 'default' && lower.includes(key)) return icon;
		}
		return foodIcons.default;
	}

	onMount(async () => {
		loadProfile();
		await seedIfEmpty(SEED_FOODS);
		await loadTodaysMeals();
		dbCount = (await getAllFoods()).length;

		const savedTheme = localStorage.getItem('theme');
		if (savedTheme) {
			theme = savedTheme;
			document.documentElement.setAttribute('data-theme', theme);
		}

		/* Listen for PWA install prompt */
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			deferredPrompt = e;
			
			// Only show if they haven't dismissed it and they have logged at least one meal
			const dismissed = localStorage.getItem('iatethis_install_dismissed');
			if (!dismissed && meals.length > 0) {
				showInstallBanner = true;
			}
		});
	});

	async function triggerInstall() {
		if (!deferredPrompt) return;
		showInstallBanner = false;
		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		if (outcome === 'accepted') {
			console.log('User accepted the A2HS prompt');
		}
		deferredPrompt = null;
	}

	function dismissInstall() {
		showInstallBanner = false;
		localStorage.setItem('iatethis_install_dismissed', 'true');
	}

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		localStorage.setItem('theme', theme);
		document.documentElement.setAttribute('data-theme', theme);
	}

	async function loadTodaysMeals() {
		meals = await getTodaysMeals();
	}

	async function switchTab(tab) {
		activeTab = tab;
		if (tab === 'log') {
			await loadLogData();
		}
		if (tab === 'insights') {
			insightsMeals = await getMealsForDays(7);
		}
	}

	async function loadLogData() {
		recentMeals = await getAllMeals();
		frequentFoods = await getFrequentFoods(6);
	}

	let logDays = $derived.by(() => {
		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const days = [];
		const now = new Date();
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			const dateStr = getLocalDateStr(d);
			const dayMeals = recentMeals.filter(m => (m.date || getLocalDateStr(new Date(m.logged_at))) === dateStr);
			const allItems = dayMeals.flatMap(m => m.items);
			const totalCal = allItems.reduce((s, item) => s + (item.cal || 0), 0);
			const totalProtein = allItems.reduce((s, item) => s + (item.protein || 0), 0);
			const totalCarbs = allItems.reduce((s, item) => s + (item.carbs || 0), 0);
			const totalFat = allItems.reduce((s, item) => s + (item.fat || 0), 0);
			
			const isToday = i === 0;
			const isYesterday = i === 1;
			let label = d.toLocaleDateString('en-IN', { weekday: 'long' });
			if (isToday) label = 'Today';
			if (isYesterday) label = 'Yesterday';
			
			days.push({
				date: dateStr,
				dayShort: dayNames[d.getDay()],
				dayNum: d.getDate(),
				label,
				formattedDate: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
				isToday,
				isFuture: false,
				totalCal: Math.round(totalCal),
				totalProtein: Math.round(totalProtein),
				totalCarbs: Math.round(totalCarbs),
				totalFat: Math.round(totalFat),
				meals: dayMeals,
				hasData: totalCal > 0
			});
		}
		return days;
	});

	function toggleDayExpand(dateStr) {
		expandedDate = expandedDate === dateStr ? null : dateStr;
		/* Scroll the matching day card into view after a tick so the DOM updates first */
		if (expandedDate) {
			requestAnimationFrame(() => {
				const card = document.querySelector(`.day-card[data-date="${dateStr}"]`);
				if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
			});
		}
	}

	async function handleSearch() {
		const q = searchQuery.trim();
		if (!q) {
			searchResults = [];
			return;
		}
		searching = true;
		searchResults = await searchFoods(q);
		searching = false;
	}

	function formatDate(dateStr) {
		const d = new Date(dateStr);
		const now = new Date();
		const todayStr = getLocalDateStr(now);
		const yesterdayDate = new Date(now);
		yesterdayDate.setDate(yesterdayDate.getDate() - 1);
		const yesterdayStr = getLocalDateStr(yesterdayDate);
		const mealDate = dateStr.includes('T') ? getLocalDateStr(new Date(dateStr)) : dateStr;

		if (mealDate === todayStr) return 'Today';
		if (mealDate === yesterdayStr) return 'Yesterday';
		return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	}

	function formatTime(dateStr) {
		return new Date(dateStr).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
	}

	/* Group meals by date for the log view */
	let groupedMeals = $derived.by(() => {
		const groups = {};
		for (const meal of recentMeals) {
			const date = meal.date || getLocalDateStr(new Date(meal.logged_at));
			if (!groups[date]) groups[date] = [];
			groups[date].push(meal);
		}
		return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
	});

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
					icon: food.icon,
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
			
			/* Trigger PWA install banner if applicable */
			const dismissed = localStorage.getItem('iatethis_install_dismissed');
			if (deferredPrompt && !dismissed) {
				showInstallBanner = true;
			}
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
		/* Also refresh log data if on log tab */
		if (activeTab === 'log') {
			await loadLogData();
		}
	}

	async function deleteSingleItem(mealId, itemIdx) {
		const key = `${mealId}:${itemIdx}`;
		if (removingItems.has(key)) return;
		removingItems = new Set([...removingItems, key]);
		// let the exit transition play before the row leaves the DOM
		await new Promise((r) => setTimeout(r, 200));
		removingItems.delete(key);
		removingItems = new Set(removingItems);
		await deleteMealItem(mealId, itemIdx);
		await loadTodaysMeals();
		/* Also refresh log data if on log tab */
		if (activeTab === 'log') {
			await loadLogData();
		}
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
			<button class="icon-btn" style="color: var(--on-surface-variant);" onclick={() => isDrawerOpen = true} aria-label="Open sidebar menu">
				<span class="material-symbols-outlined">menu</span>
			</button>
			<h1>iatethis</h1>
		</div>
		<div class="header-right">
			<button class="icon-btn" style="color: var(--tertiary);" onclick={toggleTheme} aria-label="Toggle theme">
				<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">
					{theme === 'dark' ? 'wb_sunny' : 'dark_mode'}
				</span>
			</button>
		</div>
	</header>

	<!-- DRAWER MENU -->
	{#if isDrawerOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="drawer-overlay" transition:fade={{ duration: 200 }} onclick={() => isDrawerOpen = false}></div>
		<div class="drawer" transition:fly={{ x: -320, duration: 300, easing: cubicOut }}>
			<div class="drawer-header">
				<h2 class="drawer-title">iatethis</h2>
				<button class="icon-btn" onclick={() => isDrawerOpen = false} aria-label="Close sidebar menu">
					<span class="material-symbols-outlined">close</span>
				</button>
			</div>
			
			<div class="drawer-content">
				<div class="drawer-section">
					<p class="drawer-section-title">About</p>
					<p class="drawer-text">
						An insanely fast food tracker built with Svelte 5 and IndexedDB. It learns your foods the first time, then works completely offline forever.
					</p>
				</div>

				<div class="drawer-section">
					<p class="drawer-section-title">Links</p>
					<a href="https://prateekpunetha.dev" class="drawer-link">
						<span class="material-symbols-outlined">code</span>
						<span>Developer Info</span>
					</a>
					<a href="https://github.com/prateekpunetha/iatethis" target="_blank" class="drawer-link">
						<span class="material-symbols-outlined">terminal</span>
						<span>GitHub Repo</span>
					</a>
				</div>
			</div>
		</div>
	{/if}

	<!-- DAILY TAB -->
	{#if activeTab === 'daily'}
	<main class="main-content">
		<!-- Progress Ring -->
		<section class="ring-section">
			<div class="ring-container">
				<svg class="ring-svg" viewBox="0 0 120 120">
					<circle
						class="ring-track"
						cx="60" cy="60" r={ringRadius}
					></circle>
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
					<div class="macro-bar-fill" style="transform: scaleX({Math.min(100, (totals.protein / goals.protein) * 100) / 100});"></div>
				</div>
			</div>

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
					<div class="macro-bar-fill" style="transform: scaleX({Math.min(100, (totals.carbs / goals.carbs) * 100) / 100});"></div>
				</div>
			</div>

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
					<div class="macro-bar-fill" style="transform: scaleX({Math.min(100, (totals.fat / goals.fat) * 100) / 100});"></div>
				</div>
			</div>

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
					<div class="macro-bar-fill" style="transform: scaleX({Math.min(100, (totals.fiber / goals.fiber) * 100) / 100});"></div>
				</div>
			</div>
		</section>

		<!-- Chat Input -->
		<section class="chat-input-section">
			{#if status}
				<div class="status-bar {status.type}">{status.message}</div>
			{/if}
			<div class="glass-input">
				<input
					type="text"
					bind:value={input}
					onkeydown={handleKeydown}
					placeholder="2 eggs, a cup of rice and dal..."
					aria-label="What did you eat?"
					disabled={loading}
				/>
				<button class="send-btn" onclick={handleSubmit} disabled={loading || !input.trim()} aria-label={loading ? 'Analyzing' : 'Log food'}>
					{#if loading}
						<span class="material-symbols-outlined send-spinner">progress_activity</span>
					{:else}
						<span class="material-symbols-outlined">send</span>
					{/if}
				</button>
			</div>
		</section>

		<!-- Today's Log -->
		{#if meals.length > 0}
			<section class="log-card">
				<h2 class="log-card-title">Today's Log</h2>
				<div class="log-entries">
					{#each [...meals].reverse() as meal, mealIdx (meal.id)}
						{#each meal.items as item, itemIdx}
							<div class="log-entry {removingItems.has(`${meal.id}:${itemIdx}`) ? 'removing' : ''}" style="animation-delay: {(mealIdx * meal.items.length + itemIdx) * 50}ms">
								<div class="log-entry-left">
									<div class="log-entry-icon" style="color: var(--{mealColors[(mealIdx + itemIdx) % mealColors.length]});">
										<span class="material-symbols-outlined">{getFoodIcon(item)}</span>
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
									<button class="log-entry-delete" onclick={() => deleteSingleItem(meal.id, itemIdx)} aria-label="Delete item">
										<span class="material-symbols-outlined">close</span>
									</button>
								</div>
							</div>
						{/each}
					{/each}
				</div>
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
	{/if}

	<!-- LOG TAB -->
	{#if activeTab === 'log'}
	<main class="main-content">
		<!-- Header -->
		<section class="log-history-header">
			<h2 class="text-headline-md">Log History</h2>
		</section>

		<!-- Horizontal Date Picker -->
		<section class="date-picker-scroll">
			{#each logDays as day}
				<button
					class="date-pill {day.isToday ? 'active' : ''} {!day.hasData && !day.isToday ? 'empty' : ''}"
					onclick={() => toggleDayExpand(day.date)}
				>
					<span class="date-pill-day">{day.dayShort}</span>
					<span class="date-pill-num">{day.dayNum}</span>
				</button>
			{/each}
		</section>

		<!-- Day Summary Cards -->
		<section class="day-cards">
			{#each [...logDays].reverse().filter(d => d.hasData) as day, i (day.date)}
				<article
					class="day-card {expandedDate === day.date ? 'expanded' : ''}"
					onclick={() => toggleDayExpand(day.date)}
					data-date={day.date}
					style="animation-delay: {i * 60}ms;"
				>
					<!-- Color indicator -->
					{#if day.totalCal >= goals.cal}
						<div class="day-card-indicator" style="background: var(--tertiary);"></div>
					{:else if day.totalCal >= goals.cal * 0.8}
						<div class="day-card-indicator" style="background: var(--secondary);"></div>
					{:else}
						<div class="day-card-indicator" style="background: var(--outline);"></div>
					{/if}

					<div class="day-card-top">
						<div class="day-card-left">
							<h3 class="day-card-name">{day.label}</h3>
							<p class="day-card-date">{day.formattedDate}</p>
						</div>
						<div class="day-card-right">
							<span class="day-card-cal">{day.totalCal.toLocaleString()}</span>
							<span class="day-card-cal-unit">KCAL</span>
						</div>
					</div>

					<div class="day-card-macros">
						<div class="day-card-macro">
							<span class="day-card-macro-label">PROTEIN</span>
							<div class="day-card-macro-val">
								<span>{day.totalProtein}</span>
								<span class="day-card-macro-unit">g</span>
							</div>
						</div>
						<div class="day-card-macro">
							<span class="day-card-macro-label">CARBS</span>
							<div class="day-card-macro-val">
								<span>{day.totalCarbs}</span>
								<span class="day-card-macro-unit">g</span>
							</div>
						</div>
						<div class="day-card-macro">
							<span class="day-card-macro-label">FAT</span>
							<div class="day-card-macro-val">
								<span>{day.totalFat}</span>
								<span class="day-card-macro-unit">g</span>
							</div>
						</div>
					</div>

					<!-- Expanded food items -->
					<div class="day-card-items-wrap" class:open={expandedDate === day.date}>
						<div class="day-card-items" role="presentation" onclick={(e) => e.stopPropagation()}>
							{#each day.meals as meal}
								{#each meal.items as item, itemIdx}
									<div class="day-card-item {removingItems.has(`${meal.id}:${itemIdx}`) ? 'removing' : ''}">
										<div class="day-card-item-left">
											<span class="material-symbols-outlined" style="font-size: 18px; color: var(--outline);">{getFoodIcon(item)}</span>
											<div>
												<p class="day-card-item-name">{item.name}</p>
												<p class="day-card-item-qty">{formatQty(item)}</p>
											</div>
										</div>
										<div class="day-card-item-right">
											<span class="day-card-item-cal">{Math.round(item.cal)} kcal</span>
											<button class="log-entry-delete" onclick={() => deleteSingleItem(meal.id, itemIdx)} aria-label="Delete item">
												<span class="material-symbols-outlined">close</span>
											</button>
										</div>
									</div>
								{/each}
							{/each}
						</div>
					</div>
				</article>
			{/each}

			{#if logDays.every(d => !d.hasData)}
				<div class="empty-state">
					<div class="empty-state-icon">
						<span class="material-symbols-outlined">history</span>
					</div>
					<div class="empty-state-title">No meals logged yet</div>
					<div class="empty-state-hint">Your food history will appear here</div>
				</div>
			{/if}
		</section>
	</main>

	<!-- FAB for quick add -->
	<button class="fab" onclick={() => switchTab('daily')} aria-label="Quick add food">
		<span class="material-symbols-outlined">add</span>
	</button>
	{/if}

	<!-- INSIGHTS TAB -->
	{#if activeTab === 'insights'}
	<main class="main-content">
		<!-- Header -->
		<section class="insights-header">
			<h2 class="text-headline-md">Weekly Insights</h2>
			<p class="text-body-md" style="color: var(--on-surface-variant);">{insightsData.dateRange}</p>
		</section>

		<!-- Calorie Chart Card -->
		<section class="insights-card">
			<div class="insights-card-top">
				<div>
					<h3 class="insights-card-title">CALORIE INTAKE</h3>
					<p class="insights-card-sub">Avg {insightsData.avgCal.toLocaleString()} kcal / day</p>
				</div>
			</div>
			<div class="bar-chart">
				<div class="bar-chart-y-axis">
					<span>{Math.round(insightsData.maxCal).toLocaleString()}</span>
					<span>{Math.round(insightsData.maxCal / 2).toLocaleString()}</span>
					<span>0</span>
				</div>
				<div class="bar-chart-bars">
					{#each insightsData.days as day, i}
						<div class="bar-col">
							<div class="bar-track">
								<div
									class="bar-fill"
									style="height: {(day.cal / insightsData.maxCal) * 100}%; animation-delay: {i * 80}ms;"
								></div>
							</div>
							<span class="bar-label">{day.label}</span>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- Macro Balance Card -->
		<section class="insights-card macro-donut-card">
			<h3 class="insights-card-title">MACRO BALANCE</h3>
			<div class="donut-container">
				<svg class="donut-svg" viewBox="0 0 120 120">
					<circle class="donut-track" cx="60" cy="60" r="50"></circle>
					<!-- Protein arc -->
					<circle
						class="donut-segment protein-seg"
						cx="60" cy="60" r="50"
						stroke-dasharray="{(insightsData.proteinPct / 100) * 314.16} 314.16"
						stroke-dashoffset="0"
					></circle>
					<!-- Carbs arc -->
					<circle
						class="donut-segment carbs-seg"
						cx="60" cy="60" r="50"
						stroke-dasharray="{(insightsData.carbsPct / 100) * 314.16} 314.16"
						stroke-dashoffset="{-((insightsData.proteinPct / 100) * 314.16)}"
					></circle>
					<!-- Fat arc -->
					<circle
						class="donut-segment fat-seg"
						cx="60" cy="60" r="50"
						stroke-dasharray="{(insightsData.fatPct / 100) * 314.16} 314.16"
						stroke-dashoffset="{-(((insightsData.proteinPct + insightsData.carbsPct) / 100) * 314.16)}"
					></circle>
				</svg>
				<div class="donut-center">
					<span class="donut-center-label">Weekly kcal</span>
					<span class="donut-center-value">{(insightsData.avgCal * insightsData.totalDays).toLocaleString()}</span>
				</div>
			</div>
			<div class="donut-legend">
				<div class="donut-legend-item">
					<div class="donut-dot" style="background: var(--primary); box-shadow: 0 0 8px rgba(208, 188, 255, 0.6);"></div>
					<span class="donut-legend-pct">{insightsData.proteinPct}%</span>
					<span class="donut-legend-name">Protein</span>
				</div>
				<div class="donut-legend-item">
					<div class="donut-dot" style="background: var(--secondary); box-shadow: 0 0 8px rgba(78, 222, 163, 0.6);"></div>
					<span class="donut-legend-pct">{insightsData.carbsPct}%</span>
					<span class="donut-legend-name">Carbs</span>
				</div>
				<div class="donut-legend-item">
					<div class="donut-dot" style="background: var(--tertiary); box-shadow: 0 0 8px rgba(255, 185, 95, 0.6);"></div>
					<span class="donut-legend-pct">{insightsData.fatPct}%</span>
					<span class="donut-legend-name">Fat</span>
				</div>
			</div>
		</section>

		<!-- Stats Badges -->
		<section class="insights-badges">
			<div class="badge-card">
				<div class="badge-icon" style="background: color-mix(in srgb, var(--secondary) 20%, transparent); color: var(--secondary);">
					<span class="material-symbols-outlined">local_fire_department</span>
				</div>
				<p class="badge-value">{insightsData.streak}</p>
				<p class="badge-label">DAY STREAK</p>
			</div>
			<div class="badge-card">
				<div class="badge-icon" style="background: color-mix(in srgb, var(--primary) 20%, transparent); color: var(--primary);">
					<span class="material-symbols-outlined">task_alt</span>
				</div>
				<p class="badge-value">{insightsData.targetsHit}/{insightsData.totalDays}</p>
				<p class="badge-label">TARGETS HIT</p>
			</div>
			<div class="badge-card">
				<div class="badge-icon" style="background: color-mix(in srgb, var(--tertiary) 20%, transparent); color: var(--tertiary);">
					<span class="material-symbols-outlined">emoji_events</span>
				</div>
				<p class="badge-value">{insightsData.avgProtein}g</p>
				<p class="badge-label">AVG PROTEIN</p>
			</div>
			<div class="badge-card">
				<div class="badge-icon" style="background: color-mix(in srgb, var(--primary) 20%, transparent); color: var(--primary);">
					<span class="material-symbols-outlined">restaurant</span>
				</div>
				<p class="badge-value badge-value-sm">{insightsData.topFood}</p>
				<p class="badge-label">TOP FOOD</p>
			</div>
		</section>
	</main>
	{/if}

	<!-- PROFILE TAB -->
	{#if activeTab === 'profile'}
	<main class="main-content">
		<!-- Profile Card -->
		<section class="profile-card">
			<div class="profile-card-glow"></div>
			<label class="profile-avatar" style="cursor: pointer; overflow: hidden; position: relative;">
				<input type="file" accept="image/*" style="display: none;" onchange={handleProfileUpload} />
				{#if profilePicture}
					<img src={profilePicture} alt="Profile" style="width: 100%; height: 100%; object-fit: cover;" />
				{:else}
					<span class="material-symbols-outlined" style="font-size: 48px; color: var(--primary);">person</span>
				{/if}
				<!-- Overlay edit icon -->
				<div style="position: absolute; bottom: 0; background: rgba(0,0,0,0.5); width: 100%; height: 24px; display: flex; justify-content: center; align-items: center;">
					<span class="material-symbols-outlined" style="font-size: 14px; color: white;">edit</span>
				</div>
			</label>
			<div class="profile-name-section">
				<input
					type="text"
					class="profile-name-input"
					bind:value={profileName}
					placeholder="Your name"
				/>
			</div>
		</section>

		<!-- Daily Target & Macro Sliders -->
		<section class="profile-macro-card">
			<div class="profile-macro-header">
				<div>
					<h3 class="profile-section-title" style="margin-bottom: 4px;">DAILY TARGET</h3>
					<p class="profile-macro-sub">Set your daily calorie goal</p>
				</div>
				<div class="profile-cal-input-wrap">
					<input type="number" class="profile-cal-input" bind:value={goals.cal} min="800" max="8000" step="50" />
					<span class="profile-cal-unit">kcal</span>
				</div>
			</div>

			<div class="profile-macro-divider"></div>

			<div class="profile-macro-sliders">
				<div class="profile-macro-split-header">
					<span>MACRO SPLIT</span>
					<span>100%</span>
				</div>

				<!-- Protein Slider -->
				<div class="profile-slider-group">
					<div class="profile-slider-header">
						<div class="profile-slider-label">
							<div class="profile-dot" style="background: var(--secondary);"></div>
							<span>Protein</span>
						</div>
						<div class="profile-slider-value">
							<span class="profile-slider-grams">{proteinGrams}</span>
							<span class="profile-slider-pct">g ({proteinPct}%)</span>
						</div>
					</div>
					<input type="range" class="profile-range protein-range" min="10" max="60" bind:value={proteinPct} oninput={() => adjustSlider('protein')} />
				</div>

				<!-- Carbs Slider -->
				<div class="profile-slider-group">
					<div class="profile-slider-header">
						<div class="profile-slider-label">
							<div class="profile-dot" style="background: var(--tertiary);"></div>
							<span>Carbs</span>
						</div>
						<div class="profile-slider-value">
							<span class="profile-slider-grams">{carbsGrams}</span>
							<span class="profile-slider-pct">g ({carbsPct}%)</span>
						</div>
					</div>
					<input type="range" class="profile-range carbs-range" min="10" max="70" bind:value={carbsPct} oninput={() => adjustSlider('carbs')} />
				</div>

				<!-- Fat Slider -->
				<div class="profile-slider-group">
					<div class="profile-slider-header">
						<div class="profile-slider-label">
							<div class="profile-dot" style="background: var(--error);"></div>
							<span>Fat</span>
						</div>
						<div class="profile-slider-value">
							<span class="profile-slider-grams">{fatGrams}</span>
							<span class="profile-slider-pct">g ({fatPct}%)</span>
						</div>
					</div>
					<input type="range" class="profile-range fat-range" min="10" max="60" bind:value={fatPct} oninput={() => adjustSlider('fat')} />
				</div>
			</div>

			<!-- Visual Split Bar -->
			<div class="profile-split-bar">
				<div style="width: {proteinPct}%; background: var(--secondary);"></div>
				<div style="width: {carbsPct}%; background: var(--tertiary);"></div>
				<div style="width: {fatPct}%; background: var(--error);"></div>
			</div>
		</section>

		<!-- Weight Cards -->
		<section class="profile-weight-grid">
			<div class="profile-weight-card">
				<span class="profile-weight-label">CURRENT WEIGHT</span>
				<div class="profile-weight-value-wrap">
					<input type="number" class="profile-weight-input" bind:value={profileWeight} min="20" max="300" />
					<span class="profile-weight-unit">kg</span>
				</div>
			</div>
			<div class="profile-weight-card">
				<span class="profile-weight-label">TARGET WEIGHT</span>
				<div class="profile-weight-value-wrap">
					<input type="number" class="profile-weight-input target" bind:value={profileTargetWeight} min="20" max="300" />
					<span class="profile-weight-unit">kg</span>
				</div>
			</div>
		</section>

		<!-- Fiber Goal -->
		<section class="profile-fiber-card">
			<div class="profile-fiber-left">
				<span class="material-symbols-outlined" style="color: var(--primary); font-size: 22px;">grass</span>
				<span class="profile-fiber-label">Fiber Goal</span>
			</div>
			<div class="profile-fiber-right">
				<input type="number" class="profile-fiber-input" bind:value={goals.fiber} min="0" max="100" />
				<span class="profile-fiber-unit">g/day</span>
			</div>
		</section>

		<!-- Save Button -->
		<button class="profile-save-btn" onclick={saveProfile}>
			{profileSaved ? '✓  Saved!' : 'Save Goals'}
		</button>

		<!-- Foods in database count -->
		<div class="profile-db-count">
			<span class="material-symbols-outlined" style="font-size: 16px; color: var(--outline);">database</span>
			<span>{dbCount} foods learned</span>
		</div>
	</main>
	{/if}

	<!-- PWA Install Banner -->
	{#if showInstallBanner}
		<div class="install-banner">
			<div class="install-banner-content">
				<div class="install-banner-icon">
					<img src="/favicon.png" alt="App Icon" style="width: 100%; height: 100%; border-radius: 8px;" onerror={(e) => e.target.style.display = 'none'} />
					<span class="material-symbols-outlined fallback-icon">restaurant</span>
				</div>
				<div class="install-banner-text">
					<p class="install-banner-title">Add iatethis to Home Screen</p>
					<p class="install-banner-sub">Log your meals faster and completely offline.</p>
				</div>
			</div>
			<div class="install-banner-actions">
				<button class="install-btn-secondary" onclick={dismissInstall}>Not now</button>
				<button class="install-btn-primary" onclick={triggerInstall}>Install</button>
			</div>
		</div>
	{/if}

	<!-- Bottom Navigation Bar -->
	<nav class="bottom-nav">
		<button class="nav-btn {activeTab === 'daily' ? 'active' : ''}" aria-label="Daily" onclick={() => switchTab('daily')}>
			<span class="material-symbols-outlined">dashboard</span>
			<span class="nav-btn-label">Daily</span>
		</button>
		<button class="nav-btn {activeTab === 'log' ? 'active' : ''}" aria-label="Log" onclick={() => switchTab('log')}>
			<span class="material-symbols-outlined">list_alt</span>
			<span class="nav-btn-label">Log</span>
		</button>
		<button class="nav-btn {activeTab === 'insights' ? 'active' : ''}" aria-label="Insights" onclick={() => switchTab('insights')}>
			<span class="material-symbols-outlined">insights</span>
			<span class="nav-btn-label">Insights</span>
		</button>
		<button class="nav-btn {activeTab === 'profile' ? 'active' : ''}" aria-label="Profile" onclick={() => switchTab('profile')}>
			<span class="material-symbols-outlined">person</span>
			<span class="nav-btn-label">Profile</span>
		</button>
	</nav>
</div>
