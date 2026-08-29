<script>
	import '../app.css';
	import { onMount } from 'svelte';
	
	onMount(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js');
		}
	});
</script>

<svelte:head>
	<title>iatethis — Simple AI Meal & Calorie Tracker</title>
	<meta name="description" content="A simple meal tracker where you just type what you ate. AI learns your foods once, then works offline forever." />
	<link rel="canonical" href="https://iatethis.today" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<meta name="theme-color" content="#15121b" media="(prefers-color-scheme: dark)" />
	<meta name="theme-color" content="#fdf7ff" media="(prefers-color-scheme: light)" />

	<!-- Open Graph / WhatsApp / Facebook / LinkedIn -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://iatethis.today" />
	<meta property="og:title" content="iatethis — Simple AI Meal & Calorie Tracker" />
	<meta property="og:description" content="A simple meal tracker where you just type what you ate. AI learns your foods once, then works offline forever." />
	<meta property="og:image" content="https://iatethis.today/icon-512.png" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary" />
	<meta property="twitter:url" content="https://iatethis.today" />
	<meta property="twitter:title" content="iatethis — Simple AI Meal & Calorie Tracker" />
	<meta property="twitter:description" content="A simple meal tracker where you just type what you ate. AI learns your foods once, then works offline forever." />
	<meta property="twitter:image" content="https://iatethis.today/icon-512.png" />

	<!-- Fonts & Icons -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
	<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
</svelte:head>

<slot />
