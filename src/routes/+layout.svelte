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
	<title>iatethis</title>
	<meta name="description" content="track what you eat. macros from any food, learned and cached locally." />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="theme-color" content="#15121b" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
	<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
</svelte:head>

<slot />
