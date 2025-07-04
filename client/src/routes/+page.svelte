<script lang="ts">
	import { _axios } from "$lib/_axios";
	import { createQuery } from "@tanstack/svelte-query"
	import Hero from "$lib/components/pages/home/hero.svelte";
	import NewProducts from "$lib/components/pages/home/newProducts.svelte";
	import Footer from "$lib/components/footer.svelte";
	// Fetch banners from the API
	const fetchBanners = async () => {
		const res = await _axios.get("/banner/all");
		return res.data; // { banners: [], status: boolean, total: number }
	};

	// Create query to fetch banners
	const bannerQuery = createQuery({
		queryKey: ["banners"],
		queryFn: fetchBanners
	});

	// Reactive variables
	$: banners = $bannerQuery.data?.banners || [];
	$: totalBanners = $bannerQuery.data?.total || 0;
</script>

<div >
<Hero />
<!-- <Quote /> -->
<!-- <OfferProducts /> -->
<!-- <NewProducts /> -->
<!-- <DemandBox /> -->
<NewProducts />
<Footer />
</div>

