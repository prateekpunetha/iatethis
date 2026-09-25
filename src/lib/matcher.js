/**
 * Pure text matching for food lookup.
 *
 * No database, no browser APIs — so this file can be unit tested in plain node.
 *
 * Design note: matching is deliberately *exact* (normalised / singular / token
 * subset). There is no edit-distance "fuzzy" matching here on purpose: for short
 * transliterated food words, letter similarity cannot tell a typo from a
 * different food (chicken/chickpea = 0.75, matar/tamatar = 0.71). A wrong
 * confident hit silently corrupts a calorie log, whereas a miss just falls
 * through to the online lookup, which resolves the word properly and stores it.
 */

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

/** Score tiers. Everything below MIN_SCORE is treated as "no match". */
const TIER = {
	EXACT: 1.0,   // identical after normalisation
	STEM: 0.96,   // identical after singularising, or same tokens in a different order
	SUPERSET: 0.9, // query is a subset of the candidate ("chicken" in "cooked chicken")
	SUBSET: 0.85,  // candidate is a subset of the query ("chicken" for "chicken breast")
	OVERLAP: 0.6   // partial token overlap, scaled up from here
};

/** Minimum score to accept a non-exact match */
export const MIN_SCORE = 0.7;

/** Minimum Jaccard overlap of tokens to count as a partial match */
const MIN_OVERLAP = 0.5;

/**
 * Score how well a candidate name/alias matches a query (0-1).
 * Exact token logic only — no edit distance.
 * @param {string} query
 * @param {string} candidate
 */
export function scoreCandidate(query, candidate) {
	const qNorm = normalize(query);
	const cNorm = normalize(candidate);
	if (!qNorm || !cNorm) return 0;
	if (qNorm === cNorm) return TIER.EXACT;

	const qStem = stem(query);
	const cStem = stem(candidate);
	if (qStem === cStem) return TIER.STEM;

	const qTokens = qStem.split(' ').filter(Boolean);
	const cTokens = cStem.split(' ').filter(Boolean);
	if (qTokens.length === 0 || cTokens.length === 0) return 0;

	// same words, different order ("boiled egg" vs "egg boiled")
	if (qTokens.slice().sort().join(' ') === cTokens.slice().sort().join(' ')) return TIER.STEM;

	const qSet = new Set(qTokens);
	const cSet = new Set(cTokens);

	// every query word is a word of the candidate
	if (qTokens.every(t => cSet.has(t))) return TIER.SUPERSET;

	// every candidate word is a word of the query
	if (cTokens.every(t => qSet.has(t))) return TIER.SUBSET;

	// partial overlap on whole words
	const shared = qTokens.filter(t => cSet.has(t)).length;
	const total = new Set([...qTokens, ...cTokens]).size;
	const overlap = shared / total;
	return overlap >= MIN_OVERLAP ? TIER.OVERLAP + 0.2 * overlap : 0;
}

/** @param {any} f @param {number} i */
function keyOf(f, i) {
	return f.id ?? `idx:${i}`;
}

/**
 * Find every food whose name or alias matches the query exactly (after
 * normalisation/singularising). Returns an array so callers can detect a tie.
 * @param {string} query
 * @param {any[]} foods
 */
export function findExactFoods(query, foods) {
	const qNorm = normalize(query);
	const qStem = stem(query);
	if (!qNorm) return [];

	const hits = new Map();
	for (const [i, f] of foods.entries()) {
		for (const cand of [f.name, ...(f.aliases || [])]) {
			if (normalize(cand) === qNorm || stem(cand) === qStem) {
				hits.set(keyOf(f, i), f);
				break;
			}
		}
	}
	return [...hits.values()];
}

/**
 * Match a query against a list of foods.
 *
 * Returns:
 *   - a food object when one food is the clear answer
 *   - { ambiguous: true, candidates: [...] } when several foods tie
 *   - null when nothing matches (caller should fall back to the online lookup)
 *
 * @param {string} query
 * @param {any[]} foods
 */
export function matchFood(query, foods) {
	if (!query || !query.trim() || !foods.length) return null;

	/* 1. exact name / alias match — authoritative, never wrong */
	const exact = findExactFoods(query, foods);
	if (exact.length === 1) return exact[0];
	if (exact.length > 1) return { ambiguous: true, candidates: exact };

	/* 2. whole-word scoring */
	const best = new Map(); // key -> { food, score }
	for (const [i, f] of foods.entries()) {
		for (const cand of [f.name, ...(f.aliases || [])]) {
			const sc = scoreCandidate(query, cand);
			if (sc <= 0) continue;
			const key = keyOf(f, i);
			const prev = best.get(key);
			if (!prev || sc > prev.score) best.set(key, { food: f, score: sc });
		}
	}

	let top = null;
	for (const entry of best.values()) {
		if (!top || entry.score > top.score) top = { ...entry, candidates: [entry.food] };
		else if (entry.score === top.score) top.candidates.push(entry.food);
	}
	if (!top || top.score < MIN_SCORE) return null;

	if (top.candidates.length > 1) {
		return { ambiguous: true, candidates: top.candidates };
	}
	return top.food;
}
