<script lang="ts">
    import { createMutation, createQuery } from '@tanstack/svelte-query';
    import { _axios } from '$lib/_axios';
    import { toast } from 'svelte-sonner';
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import { imgUrl } from '$lib/config';
    import Footer from '$lib/components/footer.svelte';
    import { page } from '$app/stores';
	import { goto } from '$app/navigation';
    
    interface Product {
      productId: {
		brand: any;
        _id: string;
        productName: string;
        images: string[];
      };
      quantity: number;
      totalAmount: number;
      price: number;
      customSuggestion: string;
      _id: string;
    }

    interface Address {
      _id: string;
      receiverName: string;
      receiverMobile: string;
      flatorHouseno: string;
      area: string;
      landmark: string;
    }
  
    interface Order {
      _id: string;
      user: string;
      orderId: string;
      products: Product[];
      addressId: Address;
      store: string;
      deliveryAgent: string | null;
      preparationTime: number;
      deliveryTime: string | null;
      deliverySeconds: number;
      distance: string;
      couponDiscount: number;
      deliveryPrice: number;
      platformFee: number;
      subtotal: number;
      tax: number;
      totalPrice: number;
      status: string;
      paymentMethod: string;
      paymentStatus: string;
      razorPayResponse: string;
      razorOrderId: string;
      razorPayId: string;
      tipsRazorPayId: string;
      tipsRazorPayResponse: string;
      tips: number;
      preparedAt: string;
      createdAt: string;
      updatedAt: string;
      __v: number;
    }
  
    interface OrderResponse {
      message: string;
      status: boolean;
      data: Order;
    }
  
    // Get order ID from URL parameter
    const orderId = $page.params.id;
    let isDialogOpen = false;
    let dialogElement: HTMLDivElement | null = null;

    // Query to fetch specific order details
    const orderQuery = createQuery<OrderResponse>({
      queryKey: ['order', orderId],
      queryFn: async () => {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('No token found. Please log in.');
        }
  
        try {
          const response = await _axios.get(`/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          });
  
          if (!response.data.status) {
            throw new Error(response.data.message || 'Failed to fetch order details');
          }
          return response.data;
        } catch (error) {
          throw error instanceof Error ? error : new Error('An unexpected error occurred');
        }
      },
      retry: 1,
      staleTime: 0,
      enabled: !!orderId,
    });
  
    // Format date for display
    const formatDate = (dateString: string) => {
      if (!dateString) return '-';
      const date = new Date(dateString);
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    };

    // Format time for display
    const formatTime = (dateString: string) => {
      if (!dateString) return '-';
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
      });
    };
  
    // Handle reorder
    const handleReorder = async () => {
      try {
        // Implement reorder functionality
        toast.success('Items added to cart successfully');
      } catch (error) {
        toast.error('Failed to reorder. Please try again.');
      }
    };
    const cancelOrderMutation = createMutation({
  mutationFn: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No token found. Please log in.');
    }

    try {
      const response = await _axios.post(`/orders/cancel/${orderId}`, {}, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      if (!response.data.status) {
        throw new Error(response.data.message || 'Failed to cancel the order');
      }
      goto('/order-history')
      return response.data;
    } catch (error) {
      throw error instanceof Error ? error : new Error('An unexpected error occurred');
    }
  },
  onSuccess: () => {
    toast.success('Order cancelled successfully');
    // Refetch the order to update the status
    $orderQuery.refetch();
  },
  onError: (error:any) => {
    toast.error(error instanceof Error ? error.message : 'Failed to cancel order. Please try again.');
  },
});
const handleCancelOrder = async () => {
  try {
    if (!$orderQuery.data?.data) {
      toast.error('Order details not available');
      return;
    }
    
    const orderStatus = $orderQuery.data.data.status;
    
    // Check if order can be cancelled
    if (orderStatus !== 'pending' && orderStatus !== 'accepted') {
      toast.error('This order cannot be cancelled.');
      return;
    }
    else{
      $cancelOrderMutation.mutate();
      isDialogOpen=false
    }
   
  } catch (error) {
    toast.error('Failed to cancel order. Please try again.');
  }
};
  
    // Handle buy again
    const handleBuyAgain = async (productId: string,brand:string) => {
      try {
        if(brand==='Combo Offer'){
          goto(`/comboOffers/${productId}`)
        }
        else{
          goto(`/Products/${productId}`)
        }

      } catch (error) {
        toast.error('Please try again.');
      }
    };
</script>
  
<div class="xl:max-w-[75%] 2xl:max-w-[60%] lg:max-w-[85%] md:max-w-[75%] mx-auto p-4 lg:pt-10 pb-20">

  {#if $orderQuery.isLoading}
    <div class="space-y-4">
      <Skeleton class="w-full h-24" />
      <Skeleton class="w-full h-48" />
      <Skeleton class="w-full h-64" />
    </div>
  {:else if $orderQuery.error}
    <p class="text-red-500">Error: {$orderQuery.error.message}</p>
  {:else if $orderQuery.data}
    {@const order = $orderQuery.data.data}
  <h2 class="lg:text-3xl md:text-2xl text-xl font-bold text-[#30363C] mb-4">#{$orderQuery?.data.data.orderId}</h2>
    
    <!-- Order Header Information -->
    <div class="border rounded-lg bg-white shadow-md mb-4">
      <div class="flex lg:flex-wrap gap-4  items-start justify-between lg:p-4 p-2  bg-[#F2F4F5]">
        <div>
          <p class="lg:text-lg text-base text-[#4F585E]">Order Placed</p>
          <p class="font-semibold text-[#30363C] lg:text-base text-sm">
            {formatDate(order.createdAt)} <span class="hidden lg:block"> at {formatTime(order.createdAt)}</span> 
          </p>
        </div>
        <div>
          <p class="lg:text-lg text-base text-[#4F585E]">Order Delivered</p>
          <p class="font-semibold text-[#30363C] text-base">{order.deliveryTime ? new Date(order.deliveryTime).toLocaleDateString() : '-'}</p>
        </div>
        <!-- <div>
          <p class="text-lg text-[#4F585E]">Order Status</p>
          <p class="font-semibold text-[#30363C] text-base capitalize">{order.status}</p>
        </div> -->
        <div class="lg:block hidden">
          <p class="lg:text-lg text-base text-[#4F585E]">Total Amount</p>
          <p class="font-semibold text-[#30363C] text-base">₹{order.totalPrice.toFixed(2)}</p>
        </div>
        <!-- <div class="lg:block hidden">
          <p class="text-lg text-[#4F585E]">Order Id</p>
          <p class="font-semibold text-[#30363C] text-base">#{order.orderId}</p>
        </div> -->
        <div class="flex flex-col  lg:items-end">
          <!-- <p class="font-semibold text-[#30363C] text-base lg:hidden block">#{order.orderId}</p> -->
          {#if order.status==='pending'||order.status==='accepted'}
          <button 
            class="text-[#FF080C] lg:text-xl md:text-lg text-base  font-medium  rounded-md"
            on:click={()=>{isDialogOpen=true}}
          >
           Cancel Order
          </button>
          {:else}
         {#if order.status==='cancelled' || order.status==='rejected'}
         <div>

         </div>
         {:else}
         <button 
         class="text-[#147097] lg:text-xl md:text-lg text-base font-medium  rounded-md"
         on:click={handleReorder}
       >
         Reorder
       </button>
         {/if}
          {/if}
        </div>
      </div>

      <!-- Shipping and Payment Information -->
      <div class="grid grid-cols-1 lg:grid-cols-3 lg:gap-4 lg:p-4 border-t">
        <div class=" rounded-lg lg:p-4 p-2">
          <h3 class="text-xl font-bold text-[#30363C] mb-2">Shipping Address</h3>
          <p class="font-medium text-lg">{order.addressId.receiverName}</p>
          <p class="text-lg">{order.addressId.flatorHouseno}, {order.addressId.area}</p>
          <p class="text-lg">{order.addressId.landmark}</p>
          <p class="mt-2 text-lg">Phone: {order.addressId.receiverMobile}</p>
        </div>
        
        <div class=" rounded-lg lg:p-4 p-2">
          <h3 class="text-xl font-bold text-[#30363C] mb-2">Payment Mode</h3>
          <p class=" text-lg font-medium capitalize">{order.paymentMethod}</p>
          <!-- <p class="mt-2 text-lg">Status: <span class="text-green-600 font-medium capitalize">{order.paymentStatus}</span></p> -->
        </div>
        
        <div class=" rounded-lg lg:p-4 p-2">
          <h3 class="text-xl font-bold text-[#30363C] mb-2">Payment Summary</h3>
          <div class=" text-lg flex justify-between mt-1">
            <span>Subtotal ({order.products.length} items)</span>
            <span class="font-medium">₹{order.subtotal.toFixed(2)}</span>
          </div>
          <div class="flex justify-between mt-1">
            <span>Delivery Charge</span>
            <span class="text-green-600 font-medium">{order.deliveryPrice > 0 ? `₹${order.deliveryPrice.toFixed(2)}` : 'FREE'}</span>
          </div>
          <div class="flex justify-between mt-1">
            <span>Platform Fee</span>
            <span class="font-medium">₹{order.platformFee.toFixed(2)}</span>
          </div>
          <div class="flex justify-between mt-1">
            <span>Tax</span>
            <span class="font-medium">₹{order.tax.toFixed(2)}</span>
          </div>
          <div class="flex justify-between mt-1 border-t pt-1">
            <span class="font-bold">Total Amount</span>
            <span class="font-bold">₹{order.totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Product Details -->
    <div class="border rounded-lg bg-white shadow-md">
      {#each order.products as product}
        <div class="flex   items-center p-4 border-b last:border-b-0 gap-4">
          <div class="w-20 h-20">
            <img
              src={imgUrl + product.productId.images[0]}
              alt={product.productId.productName}
              class="w-full h-full object-cover rounded"
            />
          </div>
          <div class="flex-1">
            <p class="text-xl font-semibold text-[#30363C]">{product.productId.productName}</p>
            <div class="flex  gap-4 lg:gap-8  mt-2">
              <p class="lg:text-lg text-sm">
                <span class="text-[#147097]">BRAND:</span> {product.productId.brand.name}
              </p>
              <p class="lg:text-lg text-sm">
                <span class="text-[#147097]">QTY:</span> {product.quantity}
              </p>
              <p class="lg:text-lg text-sm">
                <span class="text-[#147097]">AMOUNT:</span> ₹{product.totalAmount.toFixed(2)}
              </p>
            </div>
          </div>
          <button 
            class="text-[#01A0E2] lg:block hidden text-xl px-4 py-2 rounded-md hover:bg-[#E6F7FD] self-end sm:self-auto"
            on:click={() => handleBuyAgain(product.productId._id,product.productId.brand.name)}
          >
            Buy Again
          </button>
        </div>
      {/each}
    </div>

    <!-- Order Timeline -->
    <!-- <div class="border rounded-lg bg-white shadow-md mt-4 p-4">
      <h3 class="text-xl font-bold text-[#30363C] mb-4">Order Timeline</h3>
      <div class="relative border-l-2 border-[#01A0E2] pl-6 pb-4">
        <div class="mb-4 relative">
          <div class="absolute -left-[9px] w-4 h-4 rounded-full bg-[#01A0E2]"></div>
          <p class="text-[#30363C] font-semibold">Order Placed</p>
          <p class="text-sm text-gray-500">{formatDate(order.createdAt)} at {formatTime(order.createdAt)}</p>
        </div>
        
        {#if order.status === 'cancelled'}
          <div class="relative">
            <div class="absolute -left-[9px] w-4 h-4 rounded-full bg-red-500"></div>
            <p class="text-red-500 font-semibold">Order Cancelled</p>
            <p class="text-sm text-gray-500">{formatDate(order.updatedAt)} at {formatTime(order.updatedAt)}</p>
          </div>
        {:else}
          {#if order.preparedAt}
            <div class="mb-4 relative">
              <div class="absolute -left-[9px] w-4 h-4 rounded-full bg-[#01A0E2]"></div>
              <p class="text-[#30363C] font-semibold">Order Processed</p>
              <p class="text-sm text-gray-500">{formatDate(order.preparedAt)} at {formatTime(order.preparedAt)}</p>
            </div>
          {:else}
            <div class="mb-4 relative">
              <div class="absolute -left-[9px] w-4 h-4 rounded-full bg-gray-300"></div>
              <p class="text-[#30363C] font-semibold">Order Processed</p>
              <p class="text-sm text-gray-500">Pending</p>
            </div>
          {/if}
          
          {#if order.deliveryTime}
            <div class="relative">
              <div class="absolute -left-[9px] w-4 h-4 rounded-full bg-[#01A0E2]"></div>
              <p class="text-[#30363C] font-semibold">Order Delivered</p>
              <p class="text-sm text-gray-500">{formatDate(order.deliveryTime)} at {formatTime(order.deliveryTime)}</p>
            </div>
          {:else}
            <div class="relative">
              <div class="absolute -left-[9px] w-4 h-4 rounded-full bg-gray-300"></div>
              <p class="text-[#30363C] font-semibold">Order Delivered</p>
              <p class="text-sm text-gray-500">Pending</p>
            </div>
          {/if}
        {/if}
      </div>
    </div> -->
  {:else}
    <p class="text-gray-500">No order details found</p>
  {/if}
</div>
{#if isDialogOpen}
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20 transition-all duration-300">
          <div
            class="bg-white rounded-lg flex gap-3 flex-col items-center  shadow-lg p-6 w-full max-w-md max-h-[60vh] overflow-y-auto scrollbar-hide"
            role="dialog"
            aria-label="Add user form"
            bind:this={dialogElement}
          >
          <p>Are sure need to cancel the order?</p>
        <div class="flex justify-center gap-5 items-center">
          <button on:click={handleCancelOrder} class="px-3 py-2 shadow-sm bg-[#01A0E2] text-white rounded-lg font-medium">Confirm</button>
          <button on:click={()=>{isDialogOpen=false}} class="px-3 py-2 shadow-sm bg-red-600 border text-white rounded-lg font-medium">Decline</button>
        </div>
          </div>
        </div>
      {/if}
<Footer />

<style>
  .container {
    max-width: 60%;
    margin: 0 auto;
  }

  @media (max-width: 768px) {
    .container {
      max-width: 100%;
      padding: 1rem;
    }
  }
</style>