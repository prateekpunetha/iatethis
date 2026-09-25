import { openDB } from 'idb';
import { matchFood, findExactFoods, normalize, singularize, stem } from './matcher.js';

export { normalize, singularize, stem };

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


/** Get local date string YYYY-MM-DD */
function getLocalDateStr(date = new Date()) {
	return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

/**
 * Search for a food in the local database.
 * Returns:
 *   - a food object if a single clear match is found
 *   - { ambiguous: true, candidates: [...foods] } if multiple foods tie
 *   - null if nothing is close enough
 * @param {string} query
 */
export async function findFood(query) {
	if (!query || !query.trim()) return null;
	const db = await getDB();
	const all = await db.getAll('foods');
	return matchFood(query, all);
}

/**
 * Save a food entry to the local database, merging aliases if it already exists
 * @param {any} food
 */
export async function saveFood(food) {
	if (!food || !food.name) return null;
	const db = await getDB();
	/* Merge only on an EXACT name/alias match. Fuzzy merging used to silently
	   overwrite the macros of an unrelated food (e.g. "pulaw" onto "Veg Pulav"). */
	const existing = findExactFoods(food.name, await db.getAll('foods'))[0];
	if (existing) {
		/* merge aliases without duplicates */
		const mergedAliases = Array.from(new Set([
			...(existing.aliases || []),
			...(food.aliases || [])
		]));
		await db.put('foods', {
			...existing,
			...food,
			aliases: mergedAliases,
			id: existing.id,
			updated_at: new Date().toISOString()
		});
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

/**
 * Increment usage count for a food
 * @param {number} id
 */
export async function bumpUsage(id) {
	const db = await getDB();
	const food = await db.get('foods', id);
	if (food) {
		food.times_used = (food.times_used || 0) + 1;
		await db.put('foods', food);
	}
}

/**
 * Log a meal entry
 * @param {any[]} items
 * @param {string} [rawInput]
 */
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

/**
 * Delete a specific meal
 * @param {number} id
 */
export async function deleteMeal(id) {
	const db = await getDB();
	await db.delete('meals', id);
}

/**
 * Delete a single item from a meal
 * @param {number} mealId
 * @param {number} itemIdx
 */
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
	return all.sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
}

/**
 * Get frequently used foods, sorted by times_used desc
 * @param {number} [limit]
 */
export async function getFrequentFoods(limit = 10) {
	const db = await getDB();
	const all = await db.getAll('foods');
	return all
		.filter(f => (f.times_used || 0) > 0)
		.sort((a, b) => (b.times_used || 0) - (a.times_used || 0))
		.slice(0, limit);
}

/**
 * Search foods by name or alias (with plural/stem support)
 * @param {string} query
 */
export async function searchFoods(query) {
	const db = await getDB();
	const all = await db.getAll('foods');
	const qNorm = normalize(query);
	const qStem = stem(query);
	if (!qNorm) return [];

	return all.filter(f => {
		const candidates = [f.name, ...(f.aliases || [])];
		return candidates.some(c => {
			const cNorm = normalize(c);
			const cStem = stem(c);
			return cNorm.includes(qNorm) || cStem.includes(qStem) || qStem.includes(cStem);
		});
	}).slice(0, 20);
}

/**
 * Seed the database with initial foods (or sync seed aliases if already present)
 * @param {any[]} foods
 */
export async function seedIfEmpty(foods) {
	const db = await getDB();
	const count = await db.count('foods');
	if (count === 0) {
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
	} else {
		// Sync seed aliases to ensure new seed aliases exist in existing local DB
		const tx = db.transaction('foods', 'readwrite');
		const all = await tx.store.getAll();
		let added = false;
		for (const seed of foods) {
			const existing = all.find(f => normalize(f.name) === normalize(seed.name));
			if (existing) {
				const existingAliases = new Set(existing.aliases || []);
				let changed = false;
				for (const alias of (seed.aliases || [])) {
					if (!existingAliases.has(alias)) {
						existingAliases.add(alias);
						changed = true;
					}
				}
				if (changed) {
					existing.aliases = Array.from(existingAliases);
					tx.store.put(existing);
				}
			} else {
				// Insert the missing seed
				tx.store.add({
					...seed,
					source: 'seed',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					times_used: 0
				});
				added = true;
			}
		}
		await tx.done;
		return added;
	}
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

/**
 * Get meals for the last N days, grouped by date
 * @param {number} [days]
 */
export async function getMealsForDays(days = 7) {
	const db = await getDB();
	const all = await db.getAll('meals');
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	cutoff.setHours(0, 0, 0, 0);
	return all.filter(m => new Date(m.logged_at).getTime() >= cutoff.getTime())
		.sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
}

/**
 * Get saved vessel size preference for a food+unit combo
 * @param {string} foodName
 * @param {string} unit
 */
export function getVesselPref(foodName, unit) {
  try {
    const prefs = JSON.parse(localStorage.getItem('iatethis_vessel_prefs') || '{}');
    return prefs[`${normalize(foodName)}:${unit}`] || null;
  } catch { return null; }
}

/**
 * Save vessel size preference for a food+unit combo
 * @param {string} foodName
 * @param {string} unit
 * @param {string} size
 */
export function saveVesselPref(foodName, unit, size) {
  try {
    const prefs = JSON.parse(localStorage.getItem('iatethis_vessel_prefs') || '{}');
    prefs[`${normalize(foodName)}:${unit}`] = size;
    localStorage.setItem('iatethis_vessel_prefs', JSON.stringify(prefs));
  } catch { /* ignore */ }
}

/** Remove bad aliases: overly long ones from old bug, and ambiguous generic ones */
export async function cleanupBadAliases() {
	const db = await getDB();
	const all = await db.getAll('foods');
	let changed = false;

	// Find single-word aliases that are ambiguous (multiple foods start with that word)
	const wordToFoods = {};
	for (const f of all) {
		const firstName = normalize(f.name).split(/\s+/)[0];
		if (firstName) {
			wordToFoods[firstName] = (wordToFoods[firstName] || 0) + 1;
		}
	}

	const tx = db.transaction('foods', 'readwrite');
	for (const f of all) {
		if (f.aliases && f.aliases.length > 0) {
			const originalLength = f.aliases.length;
			const nameWords = (f.name || '').split(/\s+/).length;
			f.aliases = f.aliases.filter(a => {
				const words = a.split(' ').length;
				// Remove aliases longer than 4 words (old bug junk)
				if (words > 4) return false;
				// Remove single-word aliases for multi-word foods when ambiguous
				// e.g. "chicken" as alias for "chicken breast" when "chicken thigh" also exists
				if (words === 1 && nameWords >= 2) {
					const norm = normalize(a);
					if (wordToFoods[norm] && wordToFoods[norm] > 1) return false;
				}
				return true;
			});
			if (f.aliases.length !== originalLength) {
				tx.store.put(f);
				changed = true;
			}
		}
	}
	await tx.done;
	return changed;
}
