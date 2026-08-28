import { build, files, version } from '$service-worker';

const CACHE = `cache-${version}`;
const ASSETS = [
	...build, // all generated JS and CSS
	...files  // all static files
];

self.addEventListener('install', (event) => {
	self.skipWaiting();
	/* Create a new cache and add all files to it */
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}
	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	/* Remove previous cached data from disk and take immediate control */
	async function activateWorker() {
		const keys = await caches.keys();
		for (const key of keys) {
			if (key !== CACHE) await caches.delete(key);
		}
		await self.clients.claim();
	}
	event.waitUntil(activateWorker());
});

self.addEventListener('fetch', (event) => {
	/* ignore POST requests etc */
	if (event.request.method !== 'GET') return;

	/* ignore api calls (let them fail if offline so they fall through to catch block) */
	if (event.request.url.includes('/api/')) return;

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);

		/* `build`/`files` can always be served from the cache */
		if (ASSETS.includes(url.pathname)) {
			const cachedAsset = await cache.match(url.pathname);
			if (cachedAsset) return cachedAsset;
		}

		/* for everything else, try the network first, but */
		/* fall back to the cache if we're offline */
		try {
			const response = await fetch(event.request);

			if (response.status === 200) {
				cache.put(event.request, response.clone());
			}

			return response;
		} catch {
			const cached = await cache.match(event.request);
			if (cached) return cached;

			// For offline navigation to root or subpaths
			if (event.request.mode === 'navigate') {
				const fallback = await cache.match('/');
				if (fallback) return fallback;
			}

			return Response.error();
		}
	}

	event.respondWith(respond());
});
