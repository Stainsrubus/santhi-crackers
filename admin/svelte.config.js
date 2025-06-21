import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			fallback: 'index.html', // ✅ This is required for SPA routing
		}),
		paths: {
			base: '' // ✅ Remove this if it's not needed
		},
		prerender: {
			handleMissingId: 'warn' // ✅ Ensures missing routes won't break the build
		}
	}
};

export default config;
