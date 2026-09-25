import test from 'node:test';
import assert from 'node:assert/strict';

import { SEED_FOODS } from './seeds.js';
import { matchFood, findExactFoods, scoreCandidate, normalize, stem } from './matcher.js';

/** Fresh install: seeds with the bad-alias cleanup applied, as on first load. */
function freshDb() {
	const wordToFoods = {};
	for (const f of SEED_FOODS) {
		const first = normalize(f.name).split(' ')[0];
		if (first) wordToFoods[first] = (wordToFoods[first] || 0) + 1;
	}
	return SEED_FOODS.map((f, i) => ({
		...f,
		id: i + 1,
		aliases: (f.aliases || []).filter((a) => {
			const words = a.split(' ').length;
			if (words > 4) return false;
			if (words === 1 && f.name.split(/\s+/).length >= 2) {
				const n = normalize(a);
				if (wordToFoods[n] > 1) return false;
			}
			return true;
		})
	}));
}

const DB = freshDb();

/** What the user sees: a food, an ambiguous list, or "look it up online". */
function look(query, db = DB) {
	const r = matchFood(query, db);
	if (!r) return 'online';
	if (r.ambiguous) return 'pick:' + r.candidates.map((c) => c.name).join(' | ');
	return c_name(r);
}
const c_name = (f) => 'hit:' + f.name;

/* ------------------------------------------------------------------ *
 * 1. Different foods must never be confused
 * ------------------------------------------------------------------ */

test('chicken does not match chickpea (chole)', () => {
	assert.equal(look('chicken'), 'pick:' + DB.filter((f) => /chicken/i.test(f.name)).map((f) => f.name).join(' | '));
	assert.ok(!String(look('chicken')).includes('chole'));
});

test('matar (peas) does not match tomato', () => {
	assert.ok(!String(look('matar')).includes('tomato'));
});

test('rice does not match dice-like words', () => {
	assert.equal(scoreCandidate('rice', 'dice'), 0);
	assert.equal(scoreCandidate('pulav', 'palak'), 0);
	assert.equal(scoreCandidate('dal', 'dhal'), 0); // the real alias list covers spelling variants
});

/* ------------------------------------------------------------------ *
 * 2. Typos and unknown words fall through to the online lookup
 * ------------------------------------------------------------------ */

test('typos are not guessed locally', () => {
	for (const q of ['chiken', 'chikcen', 'brred', 'pulaw', 'pulao', 'pulav', 'toast', 'bhel']) {
		assert.equal(matchFood(q, DB), null, `"${q}" should fall through to the online lookup`);
	}
});

/* ------------------------------------------------------------------ *
 * 3. Normal usage still works exactly as before
 * ------------------------------------------------------------------ */

test('exact names and aliases still match', () => {
	assert.equal(look('daal'), 'hit:dal (toor/arhar)');
	assert.equal(look('dahi'), 'hit:curd (yogurt)');
	assert.equal(look('lassi'), 'hit:lassi (sweet)');
	assert.equal(look('samosa'), 'hit:samosa');
	assert.equal(look('pav bhaji'), 'hit:pav bhaji');
	assert.equal(look('masala chai'), 'hit:tea (with milk, sugar)');
});

test('plurals and punctuation still match', () => {
	assert.equal(look('2 rotis'), 'hit:roti (wheat)');
	assert.equal(look('Bananas!'), 'hit:banana');
	assert.equal(look('eggs'), 'hit:egg (boiled)');
});

test('the quantity never leaks into the food name', () => {
	assert.equal(look('100 gm pulav'), 'online');
	assert.equal(look('2 rotis'), 'hit:roti (wheat)');
});

/* ------------------------------------------------------------------ *
 * 4. Ambiguity is surfaced, not guessed
 * ------------------------------------------------------------------ */

test('generic words produce a picker', () => {
	const r = matchFood('chicken', DB);
	assert.ok(r.ambiguous, 'chicken should offer a choice');
	assert.ok(r.candidates.length > 1);
	assert.ok(r.candidates.every((c) => /chicken/i.test(c.name)));
});

test('a single unambiguous word is not made ambiguous', () => {
	const r = matchFood('dahi', DB);
	assert.ok(!r.ambiguous);
	assert.equal(r.name, 'curd (yogurt)');
});

/* ------------------------------------------------------------------ *
 * 5. Saving must never corrupt an existing food (the real "pulav" bug)
 * ------------------------------------------------------------------ */

test('saveFood-style dedupe is exact only', () => {
	const db = [
		...DB,
		{ id: 900, name: 'Veg Pulav', aliases: ['pulav', 'pulao'], per_100g: { cal: 180 } },
		{ id: 901, name: 'Chicken Pulav', aliases: ['chicken pulao'], per_100g: { cal: 220 } }
	];

	// "pulaw" is a different spelling -> new row, never merged into Veg Pulav
	assert.deepEqual(findExactFoods('pulaw', db), []);
	assert.equal(findExactFoods('veg pulao', db).length, 0);

	// an exact spelling variant still merges, which is the intended behaviour
	assert.equal(findExactFoods('pulav', db)[0].id, 900);
	assert.equal(findExactFoods('pulao', db)[0].id, 900);
	assert.equal(findExactFoods('chicken pulao', db)[0].id, 901);
});

/* ------------------------------------------------------------------ *
 * 6. No edit distance anywhere
 * ------------------------------------------------------------------ */

test('scoring is whole-word only', () => {
	assert.equal(scoreCandidate('banana', 'banana'), 1.0);
	assert.equal(scoreCandidate('bananas', 'banana'), 0.96); // singularised
	assert.equal(scoreCandidate('boiled egg', 'egg boiled'), 0.96); // reordered
	assert.equal(scoreCandidate('chicken', 'cooked chicken'), 0.9); // query is a subset
	assert.equal(scoreCandidate('cooked chicken', 'chicken'), 0.85); // candidate is a subset
	assert.equal(scoreCandidate('chicken', 'chickpea'), 0);
	assert.equal(scoreCandidate('matar', 'tamatar'), 0);
});

test('normalize / stem are unchanged', () => {
	assert.equal(normalize('100 gm Pulav!!'), '100 gm pulav');
	assert.equal(stem('Pulavs'), 'pulav');
	assert.equal(stem('Tomatoes'), 'tomato');
});
