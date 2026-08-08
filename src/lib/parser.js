/**
 * Parse a raw input string into structured food items.
 *
 * Handles inputs like:
 *   "200g chicken breast, 2 roti, 150g rice"
 *   "3 eggs and a banana"
 *   "chicken 200g, dal 1 bowl"
 */

const UNIT_MAP = {
	'g': 'g',
	'gm': 'g',
	'gms': 'g',
	'gram': 'g',
	'grams': 'g',
	'kg': 'kg',
	'ml': 'ml',
	'cup': 'cup',
	'cups': 'cup',
	'tbsp': 'tbsp',
	'tablespoon': 'tbsp',
	'tablespoons': 'tbsp',
	'tsp': 'tsp',
	'teaspoon': 'tsp',
	'teaspoons': 'tsp',
	'piece': 'piece',
	'pieces': 'piece',
	'pcs': 'piece',
	'pc': 'piece',
	'slice': 'slice',
	'slices': 'slice',
	'bowl': 'bowl',
	'bowls': 'bowl',
	'katori': 'bowl',
	'plate': 'plate',
	'plates': 'plate',
	'glass': 'glass',
	'glasses': 'glass',
	'scoop': 'scoop',
	'scoops': 'scoop',
	'handful': 'handful',
};

/* rough gram equivalents for non-gram units */
const UNIT_TO_GRAMS = {
	'cup': 200,
	'tbsp': 15,
	'tsp': 5,
	'bowl': 200,
	'plate': 300,
	'glass': 250,
	'handful': 30,
	'kg': 1000,
	'ml': 1, // rough, assuming water-like density
};

/**
 * @param {string} input
 * @returns {Array<{ raw: string, name: string, qty: number, unit: string }>}
 */
export function parseInput(input) {
	if (!input || !input.trim()) return [];

	/* split on comma, "and", "+", newline */
	const parts = input
		.split(/[,\n+]|\band\b/gi)
		.map(s => s.trim())
		.filter(Boolean);

	return parts.map(part => parseSingleItem(part));
}

function parseSingleItem(raw) {
	raw = raw.trim();
	let name = raw;
	let qty = 1;
	let unit = 'piece';

	/* pattern: "200g chicken breast" or "200 g chicken breast" */
	const prePattern = /^(\d+\.?\d*)\s*(g|gm|gms|gram|grams|kg|ml|cup|cups|tbsp|tablespoons?|tsp|teaspoons?|pieces?|pcs?|pc|slices?|bowls?|katori|plates?|glasses?|scoops?|handful)\s+(.+)$/i;
	let m = raw.match(prePattern);
	if (m) {
		qty = parseFloat(m[1]);
		unit = UNIT_MAP[m[2].toLowerCase()] || m[2].toLowerCase();
		name = m[3].trim();
		return { raw, name, qty, unit };
	}

	/* pattern: "chicken breast 200g" or "chicken 200 grams" */
	const postPattern = /^(.+?)\s+(\d+\.?\d*)\s*(g|gm|gms|gram|grams|kg|ml|cup|cups|tbsp|tablespoons?|tsp|teaspoons?|pieces?|pcs?|pc|slices?|bowls?|katori|plates?|glasses?|scoops?|handful)$/i;
	m = raw.match(postPattern);
	if (m) {
		name = m[1].trim();
		qty = parseFloat(m[2]);
		unit = UNIT_MAP[m[3].toLowerCase()] || m[3].toLowerCase();
		return { raw, name, qty, unit };
	}

	/* pattern: "2 roti" or "3 eggs" (number + food name, no unit) */
	const numPattern = /^(\d+\.?\d*)\s+(.+)$/;
	m = raw.match(numPattern);
	if (m) {
		qty = parseFloat(m[1]);
		name = m[2].trim();
		unit = 'piece';
		return { raw, name, qty, unit };
	}

	/* pattern: "a banana" or "an apple" */
	const articlePattern = /^(an?|one)\s+(.+)$/i;
	m = raw.match(articlePattern);
	if (m) {
		qty = 1;
		name = m[2].trim();
		unit = 'piece';
		return { raw, name, qty, unit };
	}

	/* fallback: just a food name, qty 1 serving */
	return { raw, name, qty: 1, unit: 'serving' };
}

/**
 * Convert a parsed item to grams, given the food's default_serving_g.
 * @param {{ qty: number, unit: string }} item
 * @param {{ default_serving_g: number }} food
 * @returns {number} grams
 */
export function toGrams(item, food) {
	if (item.unit === 'g') {
		return item.qty;
	}
	if (item.unit === 'piece' || item.unit === 'serving' || item.unit === 'scoop' || item.unit === 'slice') {
		return item.qty * (food.default_serving_g || 100);
	}
	if (UNIT_TO_GRAMS[item.unit]) {
		return item.qty * UNIT_TO_GRAMS[item.unit];
	}
	/* fallback: assume 1 unit = default serving */
	return item.qty * (food.default_serving_g || 100);
}
