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
</svelte:head>

<slot />
