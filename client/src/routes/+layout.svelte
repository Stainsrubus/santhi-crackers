<script lang="ts">
	import { Toaster } from 'svelte-sonner';
	import '../app.css';
	let { children } = $props();
	import { queryClient } from '$lib/query-client';
	import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment'; // To check if running in browser
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import Topbar from '$lib/components/topbar.svelte';
	import Navbar from '$lib/components/navbar.svelte';
  
    // Check for userToken on mount
    // onMount(() => {

    //   if (browser) {
    //     const userToken = localStorage.getItem('userToken');
  
    //     // If no userToken is found, redirect to /login
    //     if (!userToken) {
    //       goto('/login', { replaceState: true });
    //     }
    //   }
    // });
</script>

<Toaster position="top-center" />
<QueryClientProvider client={queryClient}>
<div class="fixed z-50">
	<Navbar />
    <Topbar />
</div>
<div class="pt-[150px] scrollbar-hide">
{@render children()}
</div>
</QueryClientProvider>
