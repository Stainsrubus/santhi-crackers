<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { _axios } from '$lib/_axios';
  import { imgUrl } from '$lib/config';
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import ProductCard from '$lib/components/productCard.svelte';
  import * as Breadcrumb from "$lib/components/ui/breadcrumb";
  import Footer from '$lib/components/footer.svelte';
  import { writableGlobalStore } from '$lib/stores/global-store';
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { tick } from 'svelte';
  import Icon from '@iconify/svelte';

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

  let debounceTimeout: any;

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

  let isMobileSidebarOpen = false;

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
        headers: { 'Content-Type': 'application/json' },
      });
      const data: CategoryResponse = response.data;
      if (data.status !== 'success') {
        throw new Error(data.showMessage || 'Failed to fetch categories');
      }
      return data.categories;
    },
    retry: 1,
    staleTime: 0,
    enabled: true,
  });

  const brandsQuery = createQuery<Brand[]>({
    queryKey: ['brands'],
    queryFn: async () => {
      const response = await _axios.get('/brand/all', {
        headers: { 'Content-Type': 'application/json' },
      });
      const data: BrandResponse = response.data;
      if (!data.status) {
        throw new Error(data.message || 'Failed to fetch brands');
      }
      return data.brands;
    },
    retry: 1,
    staleTime: 0,
    enabled: true,
  });

  const productsQuery = createQuery<Product[]>({
    queryKey: ['products', searchTerm, selectedCategoryIds, selectedBrandIds, priceRange],
    queryFn: async () => {
      const userId = isLoggedIn ? localStorage.getItem('_id') : null;

      const params: Record<string, any> = {
        limit: 1000,
        page: 1,
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
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.data.status) {
        throw new Error(response.data.message || 'Failed to fetch products');
      }

      const groupedProducts = response.data.data;
      const allProducts = groupedProducts.flatMap((category: any) =>
        category.products.map((product: any) => ({
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
        }))
      );

      return allProducts;
    },
  });

  $: categories = $categoryQuery.data ?? [];
  $: categoriesLoading = $categoryQuery.isLoading;
  $: categoriesError = $categoryQuery.error ? ($categoryQuery.error as Error).message : null;

  $: brands = $brandsQuery.data ?? [];
  $: brandsLoading = $brandsQuery.isLoading;
  $: brandsError = $brandsQuery.error ? ($brandsQuery.error as Error).message : null;

  $: products = $productsQuery.data ?? [];
  $: productsLoading = $productsQuery.isLoading;
  $: productsError = $productsQuery.error ? ($productsQuery.error as Error).message : null;

  $: activeFilters = [
    ...selectedCategoryIds.map(id => categories.find(cat => cat._id === id)?.name || ''),
    ...selectedBrandIds.map(id => brands.find(brand => brand._id === id)?.name || ''),
    priceRange[0] > 0 || priceRange[1] < 10000 ? `₹${priceRange[0]} - ₹${priceRange[1]}` : '',
  ].filter(filter => filter !== '');
</script>

<section class="bg-[#F2F4F5] py-4 px-4 md:px-6 lg:px-8">
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item>
        <Breadcrumb.Link href="/" class="text-[#4F585E] hover:text-[#01A0E2] text-base">Home</Breadcrumb.Link>
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Link href="/Products" class="text-[#01A0E2] text-base">Products</Breadcrumb.Link>
      </Breadcrumb.Item>
    </Breadcrumb.List>
  </Breadcrumb.Root>
</section>

<div class="flex min-h-screen px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
  <!-- Sidebar: Filters -->
  <aside class="w-64 p-6 border rounded-lg h-fit bg-white shadow-md lg:block hidden">
    <div>
      <h2 class="text-2xl font-bold text-[#30363C] mb-4">Categories</h2>
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
                class="h-5 w-5 text-blue-600"
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
      <h2 class="text-2xl font-bold text-[#30363C] my-4">Brands</h2>
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
                class="h-5 w-5 text-blue-600"
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
      <h2 class="text-2xl font-bold text-[#30363C] my-4">Price Range</h2>
      <Slider
        type="multiple"
        bind:value={priceRange}
        max={10000}
        step={100}
        onValueCommit={(e)=>{ $productsQuery.refetch();}}
      />
      <div class="flex justify-between mt-2 text-[#4F585E]">
        <span>₹{priceRange[0]}</span>
        <span>₹{priceRange[1]}</span>
      </div>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 lg:p-6 p-0">
    <!-- Active Filters -->
    <aside class="lg:hidden block mb-4">
      <button
        on:click={toggleMobileSidebar}
        class="bg-[#008ECC] w-fit text-white text-base px-6 py-2 rounded-full flex items-center"
      >
        Filters
        <Icon icon={isMobileSidebarOpen ? "mdi:chevron-up" : "mdi:chevron-down"} class="w-4 h-4 ml-2" />
      </button>
      <!-- Mobile Sidebar Overlay -->
<div
class="fixed inset-0 z-50 transition-opacity duration-300 {isMobileSidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}"
on:click={toggleMobileSidebar}
></div>

<!-- Mobile Sidebar Content -->
<div
class="fixed top-0 left-0 h-full w-80 bg-white z-50 shadow-xl transform transition-transform duration-700 ease-in-out {isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}"
>
<div class="p-6 h-full overflow-y-auto">
  <!-- Close Button -->
  <button
    on:click={toggleMobileSidebar}
    class="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
  >
    <Icon icon="mdi:close" class="w-6 h-6" />
  </button>

  <!-- Filter Content -->
  <div>
    <h2 class="text-2xl font-bold text-[#30363C] mb-4">Categories</h2>
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
              class="h-5 w-5 text-blue-600"
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
    <h2 class="text-2xl font-bold text-[#30363C] my-4">Brands</h2>
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
              class="h-5 w-5 text-blue-600"
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
    <h2 class="text-2xl font-bold text-[#30363C] my-4">Price Range</h2>
    <Slider
      type="multiple"
      bind:value={priceRange}
      max={10000}
      step={100}
      onValueCommit={(e)=>{ $productsQuery.refetch();}}
    />
    <div class="flex justify-between mt-2 text-[#4F585E]">
      <span>₹{priceRange[0]}</span>
      <span>₹{priceRange[1]}</span>
    </div>
  </div>
  
  <!-- Apply Button -->
  <button
    on:click={toggleMobileSidebar}
    class="mt-6 w-full bg-[#008ECC] text-white py-3 rounded-lg font-medium"
  >
    Apply Filters
  </button>
</div>
</div>
    </aside>
    {#if activeFilters.length > 0}
      <div class="mb-4 flex flex-wrap gap-2">
        <span class="bg-[#008ECC] hidden text-white text-base px-6 py-2 rounded-full lg:flex items-center">
          Active filters
          <button
            on:click={clearAllFilters}
            class="ml-2 text-white"
          >
            <Icon icon="mdi:close" class="w-4 h-4" />
          </button>
        </span>
        {#each activeFilters as filter}
          <span class="bg-[#F3F9FB] text-[#222222] text-base px-6 py-2 rounded-full flex items-center">
            {filter}
            <button
              on:click={() => {
                if (categories.find(cat => cat.name === filter)) {
                  clearCategory(categories.find(cat => cat.name === filter)?._id || '');
                } else if (brands.find(brand => brand.name === filter)) {
                  clearBrand(brands.find(brand => brand.name === filter)?._id || '');
                } else if (filter.startsWith('₹')) {
                  clearPriceRange();
                }
              }}
              class="ml-2 text-[#01A0E2]"
            >
              <Icon icon="mdi:close" class="w-4 h-4" />
            </button>
          </span>
        {/each}
      </div>
    {/if}

    <!-- Header -->
    <div class="flex items-center mb-6">
      <div class="w-1/2 md:block hidden">
        <!-- <h1 class="text-2xl font-bold text-[#30363C]">Products</h1> -->
      </div>
      <div class="md:w-1/2 w-full flex">
        <div class="lg:w-1/3 w-1/6 md:block hidden"></div>
        <div class="border py-7 flex lg:w-2/3 w-full  rounded-full bg-white p-1">
          <div class="relative w-full">
            <input
              type="text"
              placeholder="Search medical products"
              class="w-full absolute top-1/2 transform -translate-y-1/2 text-xl pl-16 rounded-full focus:outline-none focus:ring-0 text-gray-700"
              on:input={handleSearch}
            />
            <img
              class="absolute left-1 top-1/2 transform -translate-y-1/2 text-gray-400"
              src="/svg/search.svg"
              alt="search"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Product Grid -->
    <div class="mb-4 text-right text-[#4F585E]">
      {#if productsLoading}
        {products.length} results found
      {:else if productsError}
        Error: {productsError}
      {:else if products.length === 0}
        <!-- No products found -->
        {products.length} results found
      {:else}
        {products.length} results found
      {/if}
    </div>
    {#if productsLoading || productsError}
      <div class="flex flex-wrap lg:gap-10 gap-5">
        {#each Array(12) as _}
          <div class="w-56 bg-white rounded-xl shadow-md overflow-hidden">
            <Skeleton class="h-48 w-56" />
            <div class="px-4 py-2 space-y-2">
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
      <div class="text-red-500 text-center py-10">{productsError}</div>
    {:else if products.length === 0}
      <div class="text-center py-10">
        <p class="text-lg text-[#4F585E]">No products found</p>
      </div>
    {:else}
      <div class="flex flex-wrap lg:gap-10 gap-5">
        {#each products as product (product.id)}
          <ProductCard
            id={product.id}
            image={product.image}
            discount={product.discount}
            name={product.name}
            MRP={product.MRP}
            strikePrice={product.strikePrice}
            favorite={product.favorite}
          />
        {/each}
      </div>
    {/if}
  </main>
</div>
<Footer />
<style>
  .sidebar-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
    display: none;
  }

  .sidebar-open .sidebar-overlay {
    display: block;
  }

  .sidebar {
    transition: transform 0.3s ease;
    transform: translateX(-100%);
    position: fixed;
    top: 0;
    left: 0;
    width: 80%;
    max-width: 300px;
    height: 100%;
    background: white;
    z-index: 20;
    overflow-y: auto;
  }

  .sidebar-open .sidebar {
    transform: translateX(0);
  }

  @media (min-width: 768px) {
    .sidebar {
      transform: translateX(0);
      position: static;
      width: 250px;
    }
  }
</style>