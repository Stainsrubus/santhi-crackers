<script lang="ts">
	import Topbar from "$lib/components/topbar.svelte";
	import { _axios } from "$lib/_axios";
	import { imgUrl } from "$lib/config";
	import { createQuery } from "@tanstack/svelte-query";
	import * as Skeleton from "$lib/components/ui/skeleton"; // Shadcn Skeleton
	import * as Carousel from "$lib/components/ui/carousel"; // Shadcn Carousel
  import Autoplay from "embla-carousel-autoplay";
	import Navbar from "$lib/components/navbar.svelte";
	import Hero from "$lib/components/pages/home/hero.svelte";
	import Quote from "$lib/components/pages/home/quote.svelte";
	import NewProducts from "$lib/components/pages/home/newProducts.svelte";
	import Footer from "$lib/components/footer.svelte";
	import DemandBox from "$lib/components/pages/home/demandBox.svelte";
	import OfferProducts from "$lib/components/pages/home/offerProducts.svelte";

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

