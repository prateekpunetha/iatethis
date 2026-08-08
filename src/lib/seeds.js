/**
 * Seed data — common foods with verified per-100g nutritional values.
 * Sources: IFCT 2017 (Indian foods), USDA SR Legacy (international).
 * All values are per 100g unless noted.
 */
export const SEED_FOODS = [
	/* -- grains and breads -- */
	{ name: 'rice (cooked)', aliases: ['rice', 'chawal', 'steamed rice', 'white rice'], per_100g: { cal: 130, protein: 2.7, fat: 0.3, carbs: 28, fiber: 0.4 }, default_serving: '1 cup cooked', default_serving_g: 180 },
	{ name: 'brown rice (cooked)', aliases: ['brown rice', 'brown chawal'], per_100g: { cal: 123, protein: 2.7, fat: 1.0, carbs: 26, fiber: 1.8 }, default_serving: '1 cup cooked', default_serving_g: 180 },
	{ name: 'roti (wheat)', aliases: ['roti', 'chapati', 'phulka', 'fulka'], per_100g: { cal: 264, protein: 8.7, fat: 3.7, carbs: 50, fiber: 4.0 }, default_serving: '1 piece', default_serving_g: 40 },
	{ name: 'naan', aliases: ['naan', 'nan', 'tandoori naan'], per_100g: { cal: 290, protein: 8.7, fat: 5.0, carbs: 50, fiber: 2.1 }, default_serving: '1 piece', default_serving_g: 90 },
	{ name: 'paratha', aliases: ['paratha', 'prantha', 'parantha'], per_100g: { cal: 326, protein: 7.4, fat: 13.8, carbs: 44, fiber: 3.5 }, default_serving: '1 piece', default_serving_g: 60 },
	{ name: 'bread (white)', aliases: ['bread', 'white bread', 'sandwich bread'], per_100g: { cal: 265, protein: 9.0, fat: 3.2, carbs: 49, fiber: 2.7 }, default_serving: '1 slice', default_serving_g: 30 },
	{ name: 'bread (brown)', aliases: ['brown bread', 'whole wheat bread', 'atta bread'], per_100g: { cal: 252, protein: 12.3, fat: 3.5, carbs: 43, fiber: 6.0 }, default_serving: '1 slice', default_serving_g: 30 },
	{ name: 'oats', aliases: ['oats', 'rolled oats', 'oatmeal', 'porridge oats'], per_100g: { cal: 389, protein: 16.9, fat: 6.9, carbs: 66, fiber: 10.6 }, default_serving: '1 cup dry', default_serving_g: 80 },
	{ name: 'poha', aliases: ['poha', 'flattened rice', 'beaten rice', 'chivda'], per_100g: { cal: 348, protein: 6.1, fat: 1.2, carbs: 77, fiber: 1.3 }, default_serving: '1 plate', default_serving_g: 150 },
	{ name: 'upma', aliases: ['upma', 'uppma', 'sooji upma'], per_100g: { cal: 150, protein: 3.5, fat: 5.0, carbs: 22, fiber: 1.5 }, default_serving: '1 bowl', default_serving_g: 200 },
	{ name: 'dosa', aliases: ['dosa', 'plain dosa', 'sada dosa'], per_100g: { cal: 168, protein: 3.9, fat: 4.0, carbs: 28, fiber: 0.8 }, default_serving: '1 piece', default_serving_g: 80 },
	{ name: 'idli', aliases: ['idli', 'idly'], per_100g: { cal: 139, protein: 4.3, fat: 0.5, carbs: 28, fiber: 0.8 }, default_serving: '1 piece', default_serving_g: 40 },
	{ name: 'pasta (cooked)', aliases: ['pasta', 'spaghetti', 'penne', 'macaroni'], per_100g: { cal: 157, protein: 5.8, fat: 0.9, carbs: 31, fiber: 1.8 }, default_serving: '1 cup cooked', default_serving_g: 140 },
	{ name: 'maida', aliases: ['maida', 'refined flour', 'all purpose flour'], per_100g: { cal: 364, protein: 10.3, fat: 1.0, carbs: 76, fiber: 2.7 }, default_serving: '1 cup', default_serving_g: 120 },
	{ name: 'atta (wheat flour)', aliases: ['atta', 'wheat flour', 'gehun ka atta'], per_100g: { cal: 341, protein: 12.1, fat: 1.7, carbs: 72, fiber: 12.5 }, default_serving: '1 cup', default_serving_g: 120 },

	/* -- pulses and legumes -- */
	{ name: 'dal (toor/arhar)', aliases: ['dal', 'toor dal', 'arhar dal', 'yellow dal', 'pigeon pea'], per_100g: { cal: 128, protein: 6.8, fat: 2.0, carbs: 20, fiber: 3.2 }, default_serving: '1 bowl', default_serving_g: 150 },
	{ name: 'moong dal', aliases: ['moong dal', 'green gram dal', 'mung dal'], per_100g: { cal: 106, protein: 7.0, fat: 0.6, carbs: 18, fiber: 3.0 }, default_serving: '1 bowl', default_serving_g: 150 },
	{ name: 'chana dal', aliases: ['chana dal', 'bengal gram dal', 'split chickpea'], per_100g: { cal: 130, protein: 8.0, fat: 2.5, carbs: 19, fiber: 5.0 }, default_serving: '1 bowl', default_serving_g: 150 },
	{ name: 'rajma (cooked)', aliases: ['rajma', 'kidney beans', 'rajma masala'], per_100g: { cal: 127, protein: 8.7, fat: 0.5, carbs: 22, fiber: 6.4 }, default_serving: '1 bowl', default_serving_g: 200 },
	{ name: 'chole (cooked)', aliases: ['chole', 'chana', 'chickpea', 'chickpea curry', 'chana masala', 'chole masala'], per_100g: { cal: 164, protein: 8.9, fat: 2.6, carbs: 27, fiber: 7.6 }, default_serving: '1 bowl', default_serving_g: 200 },

	/* -- dairy -- */
	{ name: 'paneer', aliases: ['paneer', 'cottage cheese', 'indian cheese'], per_100g: { cal: 265, protein: 18.3, fat: 20.8, carbs: 1.2, fiber: 0 }, default_serving: '1 piece (cube)', default_serving_g: 40 },
	{ name: 'milk (full fat)', aliases: ['milk', 'full cream milk', 'whole milk', 'doodh'], per_100g: { cal: 62, protein: 3.2, fat: 3.3, carbs: 4.8, fiber: 0 }, default_serving: '1 glass', default_serving_g: 250 },
	{ name: 'milk (toned)', aliases: ['toned milk', 'low fat milk', 'lite milk'], per_100g: { cal: 50, protein: 3.3, fat: 1.5, carbs: 4.9, fiber: 0 }, default_serving: '1 glass', default_serving_g: 250 },
	{ name: 'curd (yogurt)', aliases: ['curd', 'dahi', 'yogurt', 'plain yogurt'], per_100g: { cal: 60, protein: 3.5, fat: 3.3, carbs: 4.7, fiber: 0 }, default_serving: '1 bowl', default_serving_g: 150 },
	{ name: 'greek yogurt', aliases: ['greek yogurt', 'hung curd', 'strained yogurt'], per_100g: { cal: 97, protein: 9.0, fat: 5.0, carbs: 3.6, fiber: 0 }, default_serving: '1 cup', default_serving_g: 150 },
	{ name: 'ghee', aliases: ['ghee', 'clarified butter', 'desi ghee'], per_100g: { cal: 900, protein: 0, fat: 100, carbs: 0, fiber: 0 }, default_serving: '1 tsp', default_serving_g: 5 },
	{ name: 'butter', aliases: ['butter', 'makhan'], per_100g: { cal: 717, protein: 0.9, fat: 81, carbs: 0.1, fiber: 0 }, default_serving: '1 tsp', default_serving_g: 5 },
	{ name: 'cheese', aliases: ['cheese', 'cheddar', 'processed cheese'], per_100g: { cal: 312, protein: 22.2, fat: 22.0, carbs: 5.2, fiber: 0 }, default_serving: '1 slice', default_serving_g: 20 },

	/* -- protein / meat -- */
	{ name: 'chicken breast (cooked)', aliases: ['chicken breast', 'chicken', 'grilled chicken', 'boiled chicken', 'murgh'], per_100g: { cal: 165, protein: 31.0, fat: 3.6, carbs: 0, fiber: 0 }, default_serving: '1 piece', default_serving_g: 150 },
	{ name: 'chicken thigh (cooked)', aliases: ['chicken thigh', 'chicken leg', 'tangdi'], per_100g: { cal: 209, protein: 26.0, fat: 10.9, carbs: 0, fiber: 0 }, default_serving: '1 piece', default_serving_g: 120 },
	{ name: 'chicken curry', aliases: ['chicken curry', 'chicken gravy', 'murgh curry'], per_100g: { cal: 148, protein: 14.5, fat: 8.0, carbs: 4.5, fiber: 0.5 }, default_serving: '1 bowl', default_serving_g: 200 },
	{ name: 'egg (boiled)', aliases: ['egg', 'boiled egg', 'anda', 'whole egg'], per_100g: { cal: 155, protein: 12.6, fat: 10.6, carbs: 1.1, fiber: 0 }, default_serving: '1 whole', default_serving_g: 50 },
	{ name: 'egg white', aliases: ['egg white', 'anda ka safed'], per_100g: { cal: 52, protein: 11.0, fat: 0.2, carbs: 0.7, fiber: 0 }, default_serving: '1 egg white', default_serving_g: 33 },
	{ name: 'fish (rohu, cooked)', aliases: ['fish', 'rohu', 'machhi', 'machli'], per_100g: { cal: 127, protein: 22.0, fat: 4.0, carbs: 0, fiber: 0 }, default_serving: '1 piece', default_serving_g: 100 },
	{ name: 'mutton (cooked)', aliases: ['mutton', 'lamb', 'gosht', 'goat meat'], per_100g: { cal: 258, protein: 25.6, fat: 16.5, carbs: 0, fiber: 0 }, default_serving: '1 serving', default_serving_g: 100 },
	{ name: 'prawns (cooked)', aliases: ['prawns', 'shrimp', 'jhinga'], per_100g: { cal: 99, protein: 24.0, fat: 0.3, carbs: 0.2, fiber: 0 }, default_serving: '1 serving', default_serving_g: 100 },
	{ name: 'whey protein', aliases: ['whey', 'whey protein', 'protein powder', 'protein shake'], per_100g: { cal: 400, protein: 80.0, fat: 5.0, carbs: 10.0, fiber: 0 }, default_serving: '1 scoop', default_serving_g: 30 },

	/* -- vegetables -- */
	{ name: 'aloo (potato, boiled)', aliases: ['aloo', 'potato', 'boiled potato', 'alu'], per_100g: { cal: 87, protein: 1.9, fat: 0.1, carbs: 20, fiber: 1.8 }, default_serving: '1 medium', default_serving_g: 150 },
	{ name: 'palak (spinach)', aliases: ['palak', 'spinach', 'saag'], per_100g: { cal: 23, protein: 2.9, fat: 0.4, carbs: 3.6, fiber: 2.2 }, default_serving: '1 cup cooked', default_serving_g: 180 },
	{ name: 'gobhi (cauliflower)', aliases: ['gobhi', 'cauliflower', 'gobi', 'phool gobhi'], per_100g: { cal: 25, protein: 2.0, fat: 0.3, carbs: 5.0, fiber: 2.0 }, default_serving: '1 cup', default_serving_g: 125 },
	{ name: 'bhindi (okra)', aliases: ['bhindi', 'okra', 'ladyfinger'], per_100g: { cal: 33, protein: 1.9, fat: 0.2, carbs: 7.5, fiber: 3.2 }, default_serving: '1 cup', default_serving_g: 100 },
	{ name: 'onion', aliases: ['onion', 'pyaaz', 'pyaz'], per_100g: { cal: 40, protein: 1.1, fat: 0.1, carbs: 9.3, fiber: 1.7 }, default_serving: '1 medium', default_serving_g: 110 },
	{ name: 'tomato', aliases: ['tomato', 'tamatar'], per_100g: { cal: 18, protein: 0.9, fat: 0.2, carbs: 3.9, fiber: 1.2 }, default_serving: '1 medium', default_serving_g: 125 },
	{ name: 'mixed vegetable sabzi', aliases: ['sabzi', 'vegetable curry', 'mix veg', 'mixed veg'], per_100g: { cal: 85, protein: 2.5, fat: 4.0, carbs: 10, fiber: 2.5 }, default_serving: '1 bowl', default_serving_g: 200 },

	/* -- fruits -- */
	{ name: 'banana', aliases: ['banana', 'kela'], per_100g: { cal: 89, protein: 1.1, fat: 0.3, carbs: 23, fiber: 2.6 }, default_serving: '1 medium', default_serving_g: 118 },
	{ name: 'apple', aliases: ['apple', 'seb'], per_100g: { cal: 52, protein: 0.3, fat: 0.2, carbs: 14, fiber: 2.4 }, default_serving: '1 medium', default_serving_g: 180 },
	{ name: 'mango', aliases: ['mango', 'aam'], per_100g: { cal: 60, protein: 0.8, fat: 0.4, carbs: 15, fiber: 1.6 }, default_serving: '1 medium', default_serving_g: 200 },
	{ name: 'orange', aliases: ['orange', 'santra'], per_100g: { cal: 47, protein: 0.9, fat: 0.1, carbs: 12, fiber: 2.4 }, default_serving: '1 medium', default_serving_g: 130 },

	/* -- fats, nuts, extras -- */
	{ name: 'peanut butter', aliases: ['peanut butter', 'pb'], per_100g: { cal: 588, protein: 25.0, fat: 50.0, carbs: 20, fiber: 6.0 }, default_serving: '1 tbsp', default_serving_g: 16 },
	{ name: 'almonds', aliases: ['almonds', 'badam'], per_100g: { cal: 579, protein: 21.2, fat: 49.9, carbs: 22, fiber: 12.5 }, default_serving: '10 pieces', default_serving_g: 14 },
	{ name: 'peanuts', aliases: ['peanuts', 'moongfali', 'mungfali', 'groundnut'], per_100g: { cal: 567, protein: 25.8, fat: 49.2, carbs: 16, fiber: 8.5 }, default_serving: '1 handful', default_serving_g: 30 },
	{ name: 'coconut oil', aliases: ['coconut oil', 'nariyal tel'], per_100g: { cal: 892, protein: 0, fat: 99.1, carbs: 0, fiber: 0 }, default_serving: '1 tbsp', default_serving_g: 14 },
	{ name: 'olive oil', aliases: ['olive oil'], per_100g: { cal: 884, protein: 0, fat: 100, carbs: 0, fiber: 0 }, default_serving: '1 tbsp', default_serving_g: 14 },
	{ name: 'sugar', aliases: ['sugar', 'cheeni', 'white sugar'], per_100g: { cal: 400, protein: 0, fat: 0, carbs: 100, fiber: 0 }, default_serving: '1 tsp', default_serving_g: 5 },
	{ name: 'honey', aliases: ['honey', 'shahad'], per_100g: { cal: 304, protein: 0.3, fat: 0, carbs: 82, fiber: 0.2 }, default_serving: '1 tbsp', default_serving_g: 21 },

	/* -- drinks -- */
	{ name: 'tea (with milk, sugar)', aliases: ['tea', 'chai', 'milk tea'], per_100g: { cal: 36, protein: 0.8, fat: 1.2, carbs: 5.4, fiber: 0 }, default_serving: '1 cup', default_serving_g: 150 },
	{ name: 'coffee (black)', aliases: ['black coffee', 'coffee'], per_100g: { cal: 2, protein: 0.3, fat: 0, carbs: 0, fiber: 0 }, default_serving: '1 cup', default_serving_g: 240 },
	{ name: 'lassi (sweet)', aliases: ['lassi', 'sweet lassi'], per_100g: { cal: 72, protein: 2.5, fat: 2.0, carbs: 11, fiber: 0 }, default_serving: '1 glass', default_serving_g: 250 },

	/* -- snacks and street food -- */
	{ name: 'samosa', aliases: ['samosa'], per_100g: { cal: 262, protein: 4.8, fat: 14.0, carbs: 30, fiber: 2.0 }, default_serving: '1 piece', default_serving_g: 80 },
	{ name: 'pakora', aliases: ['pakora', 'pakoda', 'bhajiya', 'bhaji'], per_100g: { cal: 245, protein: 5.5, fat: 13.0, carbs: 28, fiber: 2.5 }, default_serving: '4 pieces', default_serving_g: 100 },
	{ name: 'vada pav', aliases: ['vada pav', 'wada pav'], per_100g: { cal: 290, protein: 5.0, fat: 12.0, carbs: 40, fiber: 2.0 }, default_serving: '1 piece', default_serving_g: 150 },
	{ name: 'pav bhaji', aliases: ['pav bhaji'], per_100g: { cal: 200, protein: 4.5, fat: 8.0, carbs: 28, fiber: 3.0 }, default_serving: '1 plate', default_serving_g: 350 },
	{ name: 'biryani (chicken)', aliases: ['biryani', 'chicken biryani', 'biriyani'], per_100g: { cal: 175, protein: 8.5, fat: 6.5, carbs: 21, fiber: 0.8 }, default_serving: '1 plate', default_serving_g: 300 },
];
