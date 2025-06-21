<script lang="ts">
	import { createQuery, createInfiniteQuery } from '@tanstack/svelte-query';

	import { _axios } from '$lib/_axios';

	import { imgUrl } from '$lib/config';

	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	import ProductCard from '$lib/components/productCard.svelte';

	import * as Breadcrumb from '$lib/components/ui/breadcrumb';

	import Footer from '$lib/components/footer.svelte';

	import { writableGlobalStore } from '$lib/stores/global-store';

	import { Slider } from '$lib/components/ui/slider/index.js';

	import { onMount, tick } from 'svelte';

	import Icon from '@iconify/svelte';

	import { page } from '$app/stores';

	// ... (Interfaces remain unchanged)

	interface Category {
		_id: string;

		name: string;
	}

	interface Brand {
		_id: string;

		name: string;
	}

	interface Product {
		id: string | number;

		name: string;

		image: string;

		discount: number;

		MRP: number;

		strikePrice: number;

		description?: string;

		ratings?: number;

		brandId?: string;

		brandName?: string;

		categoryId?: string;

		categoryName?: string;

		favorite?: boolean;
	}

	interface CategoryResponse {
		categories: Category[];

		status: string;

		showMessage: string;
	}

	interface BrandResponse {
		brands: Brand[];

		status: boolean;

		total: number;

		message: string;
	}

	$: isLoggedIn = $writableGlobalStore.isLogedIn;

	let searchTerm = '';

	let selectedCategoryIds: string[] = [];

	let selectedBrandIds: string[] = [];

	let priceRange = [0, 10000];

	const limit = 5;

	let debounceTimeout: any;

	let isDesktopFilterDrawerOpen = false;

	let isMobileSidebarOpen = false;

	let drawerElement: HTMLDivElement | null = null;

	onMount(() => {
		const urlParams = new URLSearchParams($page.url.search);

		let categoryId = urlParams.get('category');

		if (!categoryId) {
			const firstParam = Array.from(urlParams.keys())[0];

			if (firstParam && firstParam.match(/^[0-9a-fA-F]{24}$/)) {
				categoryId = firstParam;
			}
		}

		if (categoryId && $categoryQuery.data) {
			const matchingCategory = $categoryQuery.data.find((cat) => cat._id === categoryId);

			if (matchingCategory && !selectedCategoryIds.includes(matchingCategory._id)) {
				selectedCategoryIds = [matchingCategory._id];

				$productsQuery.refetch();
			}
		}

		// Handle outside click for desktop drawer

		const handleOutsideClick = (event: MouseEvent) => {
			const target = event.target as Node;

			if (isDesktopFilterDrawerOpen && drawerElement && !drawerElement.contains(target)) {
				isDesktopFilterDrawerOpen = false;
			}
		};

		document.addEventListener('click', handleOutsideClick);

		return () => {
			document.removeEventListener('click', handleOutsideClick);

			clearTimeout(debounceTimeout);
		};
	});

	function debounceSearch() {
		clearTimeout(debounceTimeout);

		debounceTimeout = setTimeout(async () => {
			await tick();

			$productsQuery.refetch();
		}, 500);
	}

	function handleSearch(event: Event) {
		searchTerm = (event.target as HTMLInputElement).value;

		debounceSearch();
	}

	function toggleCategory(categoryId: string) {
		if (selectedCategoryIds.includes(categoryId)) {
			selectedCategoryIds = selectedCategoryIds.filter((id) => id !== categoryId);
		} else {
			selectedCategoryIds = [...selectedCategoryIds, categoryId];
		}

		$productsQuery.refetch();
	}

	function toggleBrand(brandId: string) {
		if (selectedBrandIds.includes(brandId)) {
			selectedBrandIds = selectedBrandIds.filter((id) => id !== brandId);
		} else {
			selectedBrandIds = [...selectedBrandIds, brandId];
		}

		$productsQuery.refetch();
	}

	function toggleDesktopFilterDrawer() {
		isDesktopFilterDrawerOpen = !isDesktopFilterDrawerOpen;
	}

	function toggleMobileSidebar() {
		isMobileSidebarOpen = !isMobileSidebarOpen;
	}

	function handlePriceChange(newValue: number[]) {
		priceRange = newValue;

		$productsQuery.refetch();
	}

	function clearCategory(categoryId: string) {
		selectedCategoryIds = selectedCategoryIds.filter((id) => id !== categoryId);

		$productsQuery.refetch();
	}

	function clearBrand(brandId: string) {
		selectedBrandIds = selectedBrandIds.filter((id) => id !== brandId);

		$productsQuery.refetch();
	}

	function clearPriceRange() {
		priceRange = [0, 10000];

		$productsQuery.refetch();
	}

	function clearAllFilters() {
		selectedCategoryIds = [];

		selectedBrandIds = [];

		priceRange = [0, 10000];

		searchTerm = '';

		$productsQuery.refetch();
	}

	const categoryQuery = createQuery<Category[]>({
		queryKey: ['category'],

		queryFn: async () => {
			const response = await _axios.get('/categories/all?limit=10', {
				headers: { 'Content-Type': 'application/json' }
			});

			const data: CategoryResponse = response.data;

			if (data.status !== 'success') {
				throw new Error(data.showMessage || 'Failed to fetch categories');
			}

			return data.categories;
		},

		retry: 1,

		staleTime: 0,

		enabled: true
	});

	const brandsQuery = createQuery<Brand[]>({
		queryKey: ['brands'],

		queryFn: async () => {
			const response = await _axios.get('/brand/all', {
				headers: { 'Content-Type': 'application/json' }
			});

			const data: BrandResponse = response.data;

			if (!data.status) {
				throw new Error(data.message || 'Failed to fetch brands');
			}

			return data.brands;
		},

		retry: 1,

		staleTime: 0,

		enabled: true
	});

	const productsQuery = createInfiniteQuery<Product[]>({
		queryKey: ['products', searchTerm, selectedCategoryIds, selectedBrandIds, priceRange],

		queryFn: async ({ pageParam = 1 }) => {
			const userId = isLoggedIn ? localStorage.getItem('_id') : null;

			const params: Record<string, any> = {
				limit,

				page: pageParam
			};

			if (userId) params.userId = userId;

			if (searchTerm.trim() !== '') params.q = searchTerm;

			if (selectedCategoryIds.length > 0) params.category = selectedCategoryIds.join(',');

			if (selectedBrandIds.length > 0) params.brand = selectedBrandIds.join(',');

			if (priceRange[0] > 0 || priceRange[1] < 10000) {
				params.minPrice = priceRange[0].toString();

				params.maxPrice = priceRange[1].toString();
			}

			const response = await _axios.get('/products/', {
				params,

				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.data.status) {
				throw new Error(response.data.message || 'Failed to fetch products');
			}

			const allProducts = response.data.data.map((product: any) => ({
				id: product._id,

				name: product.productName,

				image: product.images?.[0] || '',

				discount: product.discount || 0,

				MRP: product.price,

				strikePrice: product.strikePrice || product.price,

				description: product.description,

				ratings: product.ratings,

				brandId: product.brandId,

				brandName: product.brandName,

				categoryId: product.categoryId,

				categoryName: product.categoryName,

				favorite: product.favorite,

				available: product.available
			}));

			return {
				products: allProducts,

				nextPage: allProducts.length === limit ? pageParam + 1 : undefined,

				total: response.data.total
			};
		},

		getNextPageParam: (lastPage, allPages) => {
			const totalProducts = lastPage.total;

			const loadedProducts = allPages.reduce((sum, page) => sum + page.products.length, 0);

			return loadedProducts < totalProducts ? lastPage.nextPage : undefined;
		}
	});

	$: categories = $categoryQuery.data ?? [];

	$: categoriesLoading = $categoryQuery.isLoading;

	$: categoriesError = $categoryQuery.error ? ($categoryQuery.error as Error).message : null;

	$: brands = $brandsQuery.data ?? [];

	$: brandsLoading = $brandsQuery.isLoading;

	$: brandsError = $brandsQuery.error ? ($brandsQuery.error as Error).message : null;

	$: products = $productsQuery.data?.pages.flatMap((page) => page.products) ?? [];

	$: productsLoading = $productsQuery.isLoading || $productsQuery.isFetchingNextPage;

	$: productsError = $productsQuery.error ? ($productsQuery.error as Error).message : null;

	$: hasNextPage = $productsQuery.hasNextPage;

	$: activeFilters = [
		...selectedCategoryIds.map((id) => categories.find((cat) => cat._id === id)?.name || ''),

		...selectedBrandIds.map((id) => brands.find((brand) => brand._id === id)?.name || ''),

		priceRange[0] > 0 || priceRange[1] < 10000 ? `₹${priceRange[0]} - ₹${priceRange[1]}` : ''
	].filter((filter) => filter !== '');
</script>

<div class="relative flex h-auto px-4 pb-4 pt-10 md:px-6 md:pb-6 lg:px-4 lg:pb-8">
	<!-- Main Content -->

	<main class="flex flex-col items-start gap-10 p-0 py-0 lg:flex-row lg:px-3">
		<!-- Filter Button and Active Filters -->

		<div class="lg:mb-4 flex items-center justify-between">
			<div class="">
				<aside
					class=" h-full w-80 hidden lg:block transform bg-white shadow-xl transition-transform duration-300 ease-in-out"
				>
					<div class="h-full overflow-y-auto p-6">
						<!-- Close Button -->

						<button
							on:click={() => (isDesktopFilterDrawerOpen = false)}
							class="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
						>
							<!-- <Icon icon="mdi:close" class="w-6 h-6" /> -->
						</button>

						<!-- Filter Content -->

						<div>
							<h2 class="mb-4 text-2xl font-bold text-[#30363C]">Categories</h2>

							{#if categoriesLoading || categoriesError}
								<div class="space-y-3">
									{#each Array(5) as _}
										<div class="flex items-center gap-2">
											<Skeleton class="h-5 w-5" />

											<Skeleton class="h-5 w-32" />
										</div>
									{/each}
								</div>
							{:else}
								<div class="space-y-3">
									{#each categories as category}
										<label class="flex items-center gap-2">
											<input
												type="checkbox"
												class="min-h-5 min-w-5 accent-red-600"
												checked={selectedCategoryIds.includes(category._id)}
												on:change={() => toggleCategory(category._id)}
											/>

											<span class="text-lg text-[#4F585E]">{category.name}</span>
										</label>
									{/each}
								</div>
							{/if}
						</div>

						<div>
							<h2 class="my-4 text-2xl font-bold text-[#30363C]">Brands</h2>

							{#if brandsLoading || brandsError}
								<div class="space-y-3">
									{#each Array(5) as _}
										<div class="flex items-center gap-2">
											<Skeleton class="h-5 w-5" />

											<Skeleton class="h-5 w-32" />
										</div>
									{/each}
								</div>
							{:else}
								<div class="space-y-3">
									{#each brands as brand}
										<label class="flex items-center gap-2">
											<input
												type="checkbox"
												class="min-h-5 min-w-5 accent-red-600"
												checked={selectedBrandIds.includes(brand._id)}
												on:change={() => toggleBrand(brand._id)}
											/>

											<span class="text-lg text-[#4F585E]">{brand.name}</span>
										</label>
									{/each}
								</div>
							{/if}
						</div>

						<div>
							<h2 class="my-4 text-2xl font-bold text-[#30363C]">Price Range</h2>

							<Slider
								type="multiple"
								bind:value={priceRange}
								max={10000}
								step={100}
								onValueCommit={() => $productsQuery.refetch()}
							/>

							<div class="mt-2 flex justify-between text-[#4F585E]">
								<span>₹{priceRange[0]}</span>

								<span>₹{priceRange[1]}</span>
							</div>
						</div>

						<!-- Apply Button -->

						<!-- <button
  
  on:click={() => isDesktopFilterDrawerOpen = false}
  
  class="mt-6 w-full bg-[#008ECC] text-white py-3 rounded-lg font-medium hover:bg-[#0077A8] transition-colors"
  
  >
  
  Apply Filters
  
  </button> -->
					</div>
				</aside>
			</div>

			<!-- Mobile Filter Button -->

			<button
				on:click={toggleMobileSidebar}
				class="flex items-center rounded-full bg-custom-gradient px-6 py-2 text-base text-white lg:hidden"
			>
				<Icon icon="mdi:filter" class="mr-2 h-5 w-5" />

				Filters
			</button>
		</div>

		<!-- Mobile Sidebar Overlay -->

		<div
			class="fixed inset-0 z-50 transition-opacity duration-300 {isMobileSidebarOpen
				? 'visible opacity-100'
				: 'invisible opacity-0'}"
			on:click={toggleMobileSidebar}
		></div>

		<!-- Mobile Sidebar Content -->

		<div
			class="fixed left-0 top-0 z-50 h-full w-80 transform bg-white shadow-xl transition-transform duration-300 ease-in-out {isMobileSidebarOpen
				? 'translate-x-0'
				: '-translate-x-full'}"
		>
			<div class="h-full overflow-y-auto p-6">
				<!-- Close Button -->

				<button
					on:click={toggleMobileSidebar}
					class="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
				>
					<Icon icon="mdi:close" class="h-6 w-6" />
				</button>

				<!-- Filter Content -->

				<div>
					<h2 class="my-4 text-2xl font-bold text-[#30363C]">Price Range</h2>

					<Slider
						type="multiple"
						bind:value={priceRange}
						max={10000}
						step={100}
						onValueCommit={() => $productsQuery.refetch()}
					/>

					<div class="mt-2 flex justify-between text-[#4F585E]">
						<span>₹{priceRange[0]}</span>

						<span>₹{priceRange[1]}</span>
					</div>
				</div>

				<div>
					<h2 class="mb-4 text-2xl font-bold text-[#30363C]">Categories</h2>

					{#if categoriesLoading || categoriesError}
						<div class="space-y-3">
							{#each Array(5) as _}
								<div class="flex items-center gap-2">
									<Skeleton class="h-5 w-5" />

									<Skeleton class="h-5 w-32" />
								</div>
							{/each}
						</div>
					{:else}
						<div class="space-y-3">
							{#each categories as category}
								<label class="flex items-center gap-2">
									<input
										type="checkbox"
										class="min-h-5 min-w-5 text-blue-600"
										checked={selectedCategoryIds.includes(category._id)}
										on:change={() => toggleCategory(category._id)}
									/>

									<span class="text-lg text-[#4F585E]">{category.name}</span>
								</label>
							{/each}
						</div>
					{/if}
				</div>

				<div>
					<h2 class="my-4 text-2xl font-bold text-[#30363C]">Brands</h2>

					{#if brandsLoading || brandsError}
						<div class="space-y-3">
							{#each Array(5) as _}
								<div class="flex items-center gap-2">
									<Skeleton class="h-5 w-5" />

									<Skeleton class="h-5 w-32" />
								</div>
							{/each}
						</div>
					{:else}
						<div class="space-y-3">
							{#each brands as brand}
								<label class="flex items-center gap-2">
									<input
										type="checkbox"
										class="min-h-5 min-w-5 text-blue-600"
										checked={selectedBrandIds.includes(brand._id)}
										on:change={() => toggleBrand(brand._id)}
									/>

									<span class="text-lg text-[#4F585E]">{brand.name}</span>
								</label>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Apply Button -->

				<button
					on:click={toggleMobileSidebar}
					class="mt-6 w-full rounded-lg bg-[#008ECC] py-3 font-medium text-white transition-colors hover:bg-[#0077A8]"
				>
					Apply Filters
				</button>
			</div>
		</div>

		<!-- Header -->

		<!-- <div class="flex items-center mb-1">
  
  <div class="w-1/2 md:block hidden"></div>
  
  <div class="md:w-1/2 w-full flex">
  
  <div class="lg:w-1/3 w-1/6 md:block hidden"></div>
  
  <div class="border md:py-7 py-5 flex lg:w-2/3 w-full rounded-full bg-white md:p-1 p-0.5">
  
  <div class="relative w-full">
  
  <input
  
  type="text"
  
  placeholder="Search medical products"
  
  class="w-full absolute top-1/2 transform -translate-y-1/2 lg:text-xl text-base md:pl-16 pl-10 rounded-full focus:outline-none focus:ring-0 text-gray-700"
  
  on:input={handleSearch}
  
  />
  
  <img
  
  class="absolute left-1 md:w-[45px] w-[32px] top-1/2 transform -translate-y-1/2 text-gray-400"
  
  src="/svg/search.svg"
  
  alt="search"
  
  />
  
  </div>
  
  </div>
  
  </div>
  
  </div> -->

		<!-- Product Grid -->

		<!-- <div class="mb-1 text-right text-xs md:text-sm text-[#4F585E]">
  
  {#if productsLoading}
  
  Loading...
  
  {:else if productsError}
  
  Error: {productsError}
  
  {:else if products.length === 0}
  
  No products found
  
  {:else}
  
  {products.length} results found
  
  {/if}
  
  </div> -->

		<div>
			<!-- Active Filters -->

			{#if activeFilters.length > 0}
				<div class="mb-5 flex flex-wrap gap-2">
					{#each activeFilters as filter}
						<span
							class="flex items-center rounded-full bg-[#F3F9FB] px-4 py-1 text-base text-[#222222]"
						>
							{filter}

							<button
								on:click={() => {
									if (categories.find((cat) => cat.name === filter)) {
										clearCategory(categories.find((cat) => cat.name === filter)?._id || '');
									} else if (brands.find((brand) => brand.name === filter)) {
										clearBrand(brands.find((brand) => brand.name === filter)?._id || '');
									} else if (filter.startsWith('₹')) {
										clearPriceRange();
									}
								}}
								class="ml-2 text-[#01A0E2]"
							>
								<Icon icon="mdi:close" class="h-4 w-4" />
							</button>
						</span>
					{/each}

					<button
						on:click={clearAllFilters}
						class="flex items-center rounded-full bg-[#008ECC] px-4 py-1 text-base text-white"
					>
						Clear All

						<Icon icon="mdi:close" class="ml-2 h-4 w-4" />
					</button>
				</div>
			{/if}

			{#if productsLoading || productsError}
				<div class="flex flex-wrap gap-5 lg:gap-10">
					{#each Array(12) as _}
						<div class="w-56 overflow-hidden rounded-xl bg-white shadow-md">
							<Skeleton class="h-48 w-56" />

							<div class="space-y-2 px-4 py-2">
								<Skeleton class="h-5 w-3/4" />

								<div class="flex items-center gap-2">
									<Skeleton class="h-4 w-12" />

									<Skeleton class="h-4 w-12" />
								</div>

								<Skeleton class="h-4 w-20" />
							</div>
						</div>
					{/each}
				</div>
			{:else if productsError}
				<div class="py-10 text-center text-red-500">{productsError}</div>
			{:else if products.length === 0}
				<div class="py-10 text-center">
					<p class="text-lg text-[#4F585E]">No products found</p>
				</div>
			{:else}
				<div>
					<div
						class="card grid grid-cols-2 justify-center gap-3 md:flex md:flex-wrap md:justify-normal lg:gap-10"
					>
						{#each products as product (product.id)}
							<ProductCard
								id={product.id}
								image={product.image}
								discount={product.discount}
								name={product.name}
								MRP={product.MRP}
								strikePrice={product.strikePrice}
								favorite={product.favorite}
								available={product.available}
							/>
						{/each}
					</div>

					{#if hasNextPage}
						<button
							class="mt-4 w-full rounded-lg py-3 font-medium text-red-600 underline"
							on:click={() => $productsQuery.fetchNextPage()}
							disabled={productsLoading}
						>
							{#if productsLoading}
								Loading...
							{:else}
								Load More
							{/if}
						</button>
					{:else}
						<div class="py-10 text-center">
							<p class="text-sm text-[#939ca2]">End of products</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</main>
</div>

<Footer />

<style>
	@media (max-width: 768px) and (min-width: 500px) {
		.card {
			display: grid;

			grid-template-columns: repeat(3, 1fr);

			gap: 1rem;
		}
	}
</style>
