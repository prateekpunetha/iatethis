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

const SINGULAR_EXCEPTIONS = new Set([
	'oats', 'hummus', 'couscous', 'citrus', 'basis', 'axis', 'lentils', 'chia'
]);

/**
 * Convert plural food words to singular
 * @param {string} word
 */
export function singularize(word) {
	if (!word || word.length <= 2) return word;
	const w = word.toLowerCase().trim();
	if (SINGULAR_EXCEPTIONS.has(w)) return w;
	if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
	if (w.endsWith('tomatoes')) return w.slice(0, -2);
	if (w.endsWith('potatoes')) return w.slice(0, -2);
	if (w.endsWith('mangoes')) return w.slice(0, -2);
	if (w.endsWith('sandwiches')) return w.slice(0, -2);
	if (w.endsWith('glasses')) return w.slice(0, -2);
	if (w.endsWith('dishes')) return w.slice(0, -2);
	if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) {
		return w.slice(0, -1);
	}
	return w;
}

/**
 * Normalize a food name/query by removing punctuation and extra whitespace
 * @param {string} name
 */
export function normalize(name) {
	return (name || '')
		.toLowerCase()
		.replace(/[()[\]{},.;:!?\x27"\/\\_-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Stem a phrase into singular normalized tokens
 * @param {string} phrase
 */
export function stem(phrase) {
	return normalize(phrase)
		.split(' ')
		.filter(Boolean)
		.map(singularize)
		.join(' ');
}

/**
 * Levenshtein distance between two strings
 * @param {string} a
 * @param {string} b
 */
function levenshtein(a, b) {
	const m = a.length, n = b.length;
	const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] = a[i - 1] === b[j - 1]
				? dp[i - 1][j - 1]
				: 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
		}
	}
	return dp[m][n];
}

/**
 * Similarity score based on edit distance (0-1)
 * @param {string} a
 * @param {string} b
 */
function stringSimilarity(a, b) {
	if (a === b) return 1;
	const maxLen = Math.max(a.length, b.length);
	if (maxLen === 0) return 1;
	return 1 - (levenshtein(a, b) / maxLen);
}

/**
 * Score candidate match against query (0-1)
 * @param {string} query
 * @param {string} candidate
 */
function scoreCandidate(query, candidate) {
	const qNorm = normalize(query);
	const cNorm = normalize(candidate);
	if (!qNorm || !cNorm) return 0;
	if (qNorm === cNorm) return 1.0;

	const qStem = stem(query);
	const cStem = stem(candidate);
	if (qStem === cStem) return 0.98;

	const qTokens = qStem.split(' ').filter(Boolean);
	const cTokens = cStem.split(' ').filter(Boolean);
	if (qTokens.length === 0 || cTokens.length === 0) return 0;

	// Check sorted token equality (e.g. "boiled egg" vs "egg boiled")
	if (qTokens.slice().sort().join(' ') === cTokens.slice().sort().join(' ')) {
		return 0.95;
	}

	const qSet = new Set(qTokens);
	const cSet = new Set(cTokens);
	
	// Tokens in query that are also in candidate
	const commonQ = qTokens.filter(t => cSet.has(t));
	// Tokens in candidate that are also in query
	const commonC = cTokens.filter(t => qSet.has(t));

	// All query tokens are in candidate (e.g. "egg" in "boiled egg")
	if (commonQ.length === qTokens.length) {
		const ratio = qTokens.length / cTokens.length;
		if (ratio >= 0.5) {
			return 0.75 + 0.25 * ratio;
		}
		return 0.5 + 0.3 * ratio;
	}

	// All candidate tokens are in query (e.g. "chicken" in "cooked chicken breast")
	if (commonC.length === cTokens.length) {
		const ratio = cTokens.length / qTokens.length;
		if (ratio >= 0.5) {
			return 0.75 + 0.25 * ratio;
		}
		return 0.5 + 0.3 * ratio;
	}

	// Token overlap Jaccard
	const union = new Set([...qTokens, ...cTokens]);
	const uniqueCommon = new Set(commonQ);
	const jaccard = uniqueCommon.size / union.size;
	if (jaccard >= 0.5) {
		return 0.6 + 0.25 * jaccard;
	}

	// Edit distance for single word / close typos (e.g. "chiken" -> "chicken")
	if (qTokens.length === 1 && cTokens.length === 1) {
		const sim = stringSimilarity(qStem, cStem);
		if (sim >= 0.75) return sim * 0.9;
	}

	return 0;
}

/** Get local date string YYYY-MM-DD */
function getLocalDateStr(date = new Date()) {
	return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

/**
 * Search for a food in the local database.
 * Returns the best match or null if nothing is close enough.
 * @param {string} query
 */
export async function findFood(query) {
	if (!query || !query.trim()) return null;
	const db = await getDB();
	const all = await db.getAll('foods');
	const qNorm = normalize(query);
	const qStem = stem(query);

	/* 1. Direct exact or stemmed name / alias match */
	for (const f of all) {
		if (normalize(f.name) === qNorm || stem(f.name) === qStem) return f;
		for (const a of (f.aliases || [])) {
			if (normalize(a) === qNorm || stem(a) === qStem) return f;
		}
	}

	/* 2. Fuzzy / scored match */
	let best = null;
	let bestScore = 0;
	for (const f of all) {
		const candidates = [f.name, ...(f.aliases || [])];
		for (const cand of candidates) {
			const sc = scoreCandidate(query, cand);
			if (sc > bestScore) {
				bestScore = sc;
				best = f;
			}
		}
	}

	if (bestScore >= 0.7) return best;
	return null;
}

/**
 * Save a food entry to the local database, merging aliases if it already exists
 * @param {any} food
 */
export async function saveFood(food) {
	if (!food || !food.name) return null;
	const db = await getDB();
	/* check if we already have this food */
	const existing = await findFood(food.name);
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
			}
		}
		await tx.done;
		return false;
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
