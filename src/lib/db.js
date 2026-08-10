import { openDB } from 'idb';

const DB_NAME = 'iatethis';
const DB_VERSION = 1;

async function getDB() {
	return openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains('foods')) {
				const foodStore = db.createObjectStore('foods', { keyPath: 'id', autoIncrement: true });
				foodStore.createIndex('name', 'name', { unique: false });
			}
			if (!db.objectStoreNames.contains('meals')) {
				const mealStore = db.createObjectStore('meals', { keyPath: 'id', autoIncrement: true });
				mealStore.createIndex('date', 'date', { unique: false });
			}
		}
	});
}

/** normalize a food name for matching */
function normalize(name) {
	return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Get local date string YYYY-MM-DD */
function getLocalDateStr(date = new Date()) {
	return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

/** simple similarity score between two strings (0-1) */
function similarity(a, b) {
	a = normalize(a);
	b = normalize(b);
	if (a === b) return 1;

	/* token overlap */
	const tokensA = new Set(a.split(' '));
	const tokensB = new Set(b.split(' '));
	const intersection = [...tokensA].filter(t => tokensB.has(t));
	const union = new Set([...tokensA, ...tokensB]);
	return intersection.length / union.size;
}

/**
 * Search for a food in the local database.
 * Returns the best match or null if nothing is close enough.
 */
export async function findFood(query) {
	const db = await getDB();
	const all = await db.getAll('foods');
	const q = normalize(query);

	/* exact name match */
	let match = all.find(f => normalize(f.name) === q);
	if (match) return match;

	/* alias match */
	match = all.find(f =>
		(f.aliases || []).some(a => normalize(a) === q)
	);
	if (match) return match;

	/* fuzzy match */
	let best = null;
	let bestScore = 0;
	for (const f of all) {
		const nameScore = similarity(q, f.name);
		const aliasScores = (f.aliases || []).map(a => similarity(q, a));
		const score = Math.max(nameScore, ...aliasScores);
		if (score > bestScore) {
			best = f;
			bestScore = score;
		}
	}

	if (bestScore >= 0.7) return best;
	return null;
}

/** Save a food entry to the local database */
export async function saveFood(food) {
	const db = await getDB();
	/* check if we already have this food */
	const existing = await findFood(food.name);
	if (existing) {
		/* update existing */
		await db.put('foods', { ...existing, ...food, id: existing.id, updated_at: new Date().toISOString() });
		return existing.id;
	}
	const id = await db.add('foods', {
		...food,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		times_used: 0
	});
	return id;
}

/** Increment usage count for a food */
export async function bumpUsage(id) {
	const db = await getDB();
	const food = await db.get('foods', id);
	if (food) {
		food.times_used = (food.times_used || 0) + 1;
		await db.put('foods', food);
	}
}

/** Log a meal entry */
export async function logMeal(items, rawInput = '') {
	const db = await getDB();
	const today = getLocalDateStr();
	const entry = {
		date: today,
		rawInput,
		items: JSON.parse(JSON.stringify(items)),
		logged_at: new Date().toISOString()
	};
	return db.add('meals', entry);
}

/** Delete a specific meal */
export async function deleteMeal(id) {
	const db = await getDB();
	await db.delete('meals', id);
}

/** Delete a single item from a meal */
export async function deleteMealItem(mealId, itemIdx) {
	const db = await getDB();
	const meal = await db.get('meals', mealId);
	if (meal) {
		meal.items.splice(itemIdx, 1);
		if (meal.items.length === 0) {
			await db.delete('meals', mealId);
		} else {
			await db.put('meals', meal);
		}
	}
}

/** Get all meals for today */
export async function getTodaysMeals() {
	const db = await getDB();
	const today = getLocalDateStr();
	const all = await db.getAllFromIndex('meals', 'date', today);
	return all;
}

/** Get all foods in the database */
export async function getAllFoods() {
	const db = await getDB();
	return db.getAll('foods');
}

/** Get all meals, sorted newest first */
export async function getAllMeals() {
	const db = await getDB();
	const all = await db.getAll('meals');
	return all.sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));
}

/** Get frequently used foods, sorted by times_used desc */
export async function getFrequentFoods(limit = 10) {
	const db = await getDB();
	const all = await db.getAll('foods');
	return all
		.filter(f => (f.times_used || 0) > 0)
		.sort((a, b) => (b.times_used || 0) - (a.times_used || 0))
		.slice(0, limit);
}

/** Search foods by name */
export async function searchFoods(query) {
	const db = await getDB();
	const all = await db.getAll('foods');
	const q = query.toLowerCase().trim();
	if (!q) return [];
	return all.filter(f => 
		f.name.toLowerCase().includes(q) ||
		(f.aliases || []).some(a => a.toLowerCase().includes(q))
	).slice(0, 20);
}

/** Seed the database with initial foods (only if empty) */
export async function seedIfEmpty(foods) {
	const db = await getDB();
	const count = await db.count('foods');
	if (count > 0) return false;

	const tx = db.transaction('foods', 'readwrite');
	for (const food of foods) {
		tx.store.add({
			...food,
			source: 'seed',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			times_used: 0
		});
	}
	await tx.done;
	return true;
}

/** Delete all meals for today */
export async function clearTodaysMeals() {
	const db = await getDB();
	const today = getLocalDateStr();
	const all = await db.getAllFromIndex('meals', 'date', today);
	const tx = db.transaction('meals', 'readwrite');
	for (const meal of all) {
		tx.store.delete(meal.id);
	}
	await tx.done;
}

/** Get meals for the last N days, grouped by date */
export async function getMealsForDays(days = 7) {
	const db = await getDB();
	const all = await db.getAll('meals');
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	cutoff.setHours(0, 0, 0, 0);
	return all.filter(m => new Date(m.logged_at) >= cutoff)
		.sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
}
