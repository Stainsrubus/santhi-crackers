<script lang="ts">
	import { goto } from '$app/navigation';
	import { _axios } from '$lib/_axios';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { writableGlobalStore } from '$lib/stores/global-store';
	import Icon from '@iconify/svelte';
	import { createMutation } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { z } from 'zod';
	import bg from '$lib/assets/log-bg.jpg'; // Import the image

	// Schema for form validation
	const schema = z.object({
		email: z.string().email(),
		password: z.string().min(4)
	});

	type LoginData = z.infer<typeof schema>;

	// Form state
	let email = $state('');
	let password = $state('');
	let passwordShown = $state(false);

	// Login mutation with loading state
	let loginMutation = createMutation({
		mutationFn: (data: LoginData) => _axios.post('/auth/login', data),
		onSuccess({ data }) {
			if (!data.ok) {
				toast(data.message, {});
				return;
			}
			localStorage.setItem('storeId', data.data.id);
			toast(data.message, {});
			goto('/dashboard');
		},
		onError(error, variables, context) {
			console.error('onError', error, variables, context);
			toast('An error occurred during login. Please try again.');
		}
	});

	// Derived loading state
	const isLoading = $derived($loginMutation.isPending);

	function login(e: Event) {
		e.preventDefault();
		try {
			const data = schema.parse({
				email,
				password
			});
			$loginMutation.mutate(data);
		} catch (error) {
			console.error(error);
			toast('Invalid email or password');
		}
	}
</script>

<div class="flex h-screen">
	<!-- Image Container -->
	<div class="hidden md:flex w-1/2 bg-cover bg-left" style={`background-image: url(${bg});`}>
		<div class="flex justify-center items-center h-full w-full">
			<img src="/logo.png" alt="Logo" />
		</div>
	</div>

	<!-- Login Form Container -->
	<div class="flex w-full md:w-1/2 items-center justify-center bg-gray-50">
		<Card.Root class="w-full max-w-md bg-white shadow-lg rounded-lg p-8">
			<Card.Header class="text-center mb-6">
				<Card.Title class="text-2xl font-semibold text-gray-800">Login</Card.Title>
				<p class="text-sm text-gray-600">Welcome back! Please enter your credentials.</p>
			</Card.Header>
			<Card.Content>
				<form onsubmit={login}>
					<div class="space-y-6">
						<div class="space-y-2">
							<Label for="email" class="text-sm font-medium text-gray-700">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="admin@example.com"
								required
								bind:value={email}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div class="space-y-2 relative">
							<Label for="password" class="text-sm font-medium text-gray-700">Password</Label>
							<Input
								id="password"
								placeholder="Password"
								type={passwordShown ? 'text' : 'password'}
								required
								bind:value={password}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
							/>
							<Icon
								onclick={() => {
									passwordShown = !passwordShown;
								}}
								icon={!passwordShown ? 'mdi:eye-off-outline' : 'mdi:eye-outline'}
								class="absolute right-3 bottom-3 cursor-pointer text-gray-400 hover:text-gray-600 text-xl"
							/>
						</div>
						<Button
							type="submit"
							disabled={isLoading}
							class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center"
						>
							{#if isLoading}
								<Icon icon="mdi:loading" class="animate-spin mr-2" />
								Logging in...
							{:else}
								Login
							{/if}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</div>