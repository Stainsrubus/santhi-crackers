<script lang="ts">
	import { goto } from '$app/navigation';
	import { _axios } from '$lib/_axios';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import { imgUrl } from '$lib/config';
	import { queryClient } from '$lib/query-client';
	import Icon from '@iconify/svelte';
	import { createMutation, createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod } from 'sveltekit-superforms/adapters';
	import { _productsSchema, productEditStore, type Option } from './schema';
	import { z } from 'zod';
	import { isAxiosError } from 'axios';

	// Specification Schema
	const _specificationSchema = z.object({
		name: z.string({ message: 'Specification name is required' }).min(1, 'Specification name is required'),
		fields: z.array(z.string({ message: 'Field is required' }).min(1, 'Field cannot be empty')),
	});

	// Fetch functions
	async function fetchCategories() {
		const res = await _axios.get(`/productcategory/select`);
		return res.data;
	}

	async function fetchSpecifications() {
		const res = await _axios.get('/specification/all');
		return res.data;
	}

	async function fetchBrands() {
		const res = await _axios.get(`/brands/select`);
		return res.data;
	}

	// Queries
	const specificationsQuery = createQuery({
		queryKey: ['specifications'],
		queryFn: fetchSpecifications,
	});

	const categoryQuery = createQuery({
		queryKey: ['category select'],
		queryFn: () => fetchCategories(),
	});

	const brandQuery = createQuery({
		queryKey: ['brand select'],
		queryFn: () => fetchBrands(),
	});

	// State
	let files = $state<File[]>([]);
	let edit = $state(false);
	let existingImages = $state<string[]>([]);
	let options = $state<Option[]>([]);
	let selectedSpecifications = $state<{ id: string; name: string; fields: Record<string, string> }[]>([]);
	let optionsError = $state<string | null>(null);
	// Popup state
	let showSpecPopup = $state(false);
	let newSpecName = $state('');
	let specFields = $state<string[]>([]);
	let currentSpecField = $state('');
	let selectOpen = $state(false);

	$effect(() => {
		if ($productEditStore.id) {
			edit = true;
			$form.category = $productEditStore.category?._id
				? `${$productEditStore.category._id} -&- ${$productEditStore.category.name}`
				: '';
			$form.brand = $productEditStore.brand?._id
				? `${$productEditStore.brand._id} -&- ${$productEditStore.brand.name}`
				: '';
			$form.description = $productEditStore.description || '';
			$form.productName = $productEditStore.productName || '';
			$form.price = $productEditStore.price ? String($productEditStore.price) : '';
			$form.stock = $productEditStore.stock ? String($productEditStore.stock) : '';
			$form.HSNCode = $productEditStore.HSNCode || '';
			$form.productCode = $productEditStore.productCode || '';
			$form.topSeller = $productEditStore.topSeller ?? false;
			$form.gst = $productEditStore.gst ? String($productEditStore.gst) : '';
			$form.active = $productEditStore.active ?? true;

			existingImages = Array.isArray($productEditStore.images)
				? $productEditStore.images
				: typeof $productEditStore.images === 'string' && $productEditStore.images
				? [$productEditStore.images]
				: [];

			if ($productEditStore.options?.length > 0) {
				options = $productEditStore.options;
			}

			if ($productEditStore.specifications?.length > 0) {
				const availableSpecs = $specificationsQuery.data?.specifications || [];
				selectedSpecifications = $productEditStore.specifications
					.map((storedSpec: any) => {
						const matchingSpec = availableSpecs.find((spec: any) => spec.name === storedSpec.name);
						return {
							id: storedSpec._id || storedSpec.name,
							name: storedSpec.name || matchingSpec?.name || 'Unknown',
							fields:
								storedSpec.fields ||
								(matchingSpec
									? Object.fromEntries(matchingSpec.fields.map((field: any) => [field, '']))
									: {}),
						};
					})
					.filter((spec, index, self) => index === self.findIndex((s) => s.name === spec.name));
			} else {
				selectedSpecifications = [];
			}
		} else {
			edit = false;
			reset();
			files = [];
			existingImages = [];
			options = [];
			selectedSpecifications = [];
		}
	});

	// Validate options
	function validateOptions(): boolean {
		if (options.length === 0) return true;
		return options.every(
			(opt) => opt.title.trim() !== '' && opt.values.length > 0 && opt.values.every((val) => val.trim() !== '')
		);
	}

	// Check if new option can be added
	function canAddOption(): boolean {
		if (options.length === 0) return true;
		return validateOptions();
	}

	// Specification creation mutation
	const createSpecificationMutation = createMutation({
  mutationFn: async (data: { name: string; fields: string[] }) => {
    const response = await _axios.post('/specification/addspec', data);
    // Ensure the response has the expected structure
    if (!response.data) {
      throw new Error('Invalid response from server');
    }
    return response;
  },
  onSuccess: (response) => {
    // Check if the response indicates success based on your API's structure
    if (response.data?.status === true || response.status === 200) {
      toast.success('Specification created successfully');
      
      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['specifications'] });
      
      // Add the new specification to the selected list
      selectedSpecifications = [
        ...selectedSpecifications,
        {
          id: response.data.data?._id || response.data.data?.name || Date.now().toString(),
          name: response.data.data?.name || newSpecName,
          fields: Object.fromEntries(
            (response.data.data?.fields || specFields).map((field: string) => [field, ''])
          ),
        },
      ];
      
      // Reset form and state
      newSpecName = '';
      specFields = [];
      currentSpecField = '';
      showSpecPopup = false;
    } else {
      // Handle API response that indicates failure
      throw new Error(response.data?.message || 'Failed to create specification');
    }
  },
  onError: (error) => {
    // Handle different types of errors
    let errorMessage = 'Failed to create specification';
    
    if (isAxiosError(error)) {
      // The request was made and the server responded with a status code
      errorMessage = error.response?.data?.message || 
                   error.response?.data?.error || 
                   error.message;
    } else {
      // Regular Error object
      errorMessage = error.message;
    }
    
    toast.error(errorMessage);
    console.error('Specification creation error:', error);
  }
});

	// Specification form
	const { form: specForm, errors: specErrors, enhance: specEnhance, constraints: specConstraints, reset: specReset } = superForm(
		defaults(zod(_specificationSchema)),
		{
			SPA: true,
			validationMethod: 'oninput',
			validators: zod(_specificationSchema),
			clearOnSubmit: 'none',
			invalidateAll: false,
			resetForm: false,
			onSubmit: () => {
				if (specFields.length === 0) {
        toast.error('Please add at least one field');
        return;
      }
				const data = {
					name: newSpecName.trim(),
					fields: specFields,
				};
				$createSpecificationMutation.mutate(data);
			},
		}
	);

	// Product creation mutation
	const createProductMutation = createMutation({
		mutationFn: (data: FormData) =>
			edit ? _axios.put(`/product/${$productEditStore.id}`, data) : _axios.post('/product/create', data),
		onSuccess({ data }) {
			queryClient.refetchQueries({ queryKey: ['products fetch'] });
			if (data.status === true) {
				if (edit) {
					$productEditStore.mode = 'list';
					reset();
					toast('Product Updated ✅');
					goto('/dashboard/products?mode=list');
					$productEditStore.id = '';
					$productEditStore.category = { categoryNumber: 0, _id: '', name: '' };
					$productEditStore.brand = { _id: '', name: '' };
					$productEditStore.description = '';
					$productEditStore.productName = '';
					$productEditStore.price = '';
					$productEditStore.stock = '';
					$productEditStore.HSNCode = '';
					$productEditStore.productCode = '';
					$productEditStore.topSeller = false;
					$productEditStore.images = '';
					$productEditStore.gst = '';
					$productEditStore.options = [];
					selectedSpecifications = [];
				} else {
					toast('Product Created ✅');
				}
				reset();
				files = [];
				existingImages = [];
				options = [];
			} else {
				toast.error(data.message);
			}
		},
		onError(error) {
			console.error('onError', error);
			toast.error('An error occurred while processing your request.');
		},
	});

	// Product form
	const { form, errors, enhance, constraints, reset, validateForm } = superForm(
		defaults(zod(_productsSchema), { stock: '' }),
		{
			SPA: true,
			validationMethod: 'onblur',
			validators: zod(_productsSchema),
			clearOnSubmit: 'none',
			invalidateAll: false,
			resetForm: false,
			async onSubmit() {
				const { valid } = await validateForm({ focusOnError: true });
				if (!$form.category) {
					toast.error('Please select a category');
					return;
				}
				if (!valid) {
					for (const field in $errors) {
						if ($errors[field]) {
							toast.error(`${field}: ${$errors[field]}`);
						}
					}
					return;
				}
				if (files.length === 0 && (!edit || existingImages.length === 0)) {
					toast.error('Please upload at least one image');
					return;
				}
				if (!validateOptions()) {
					toast.error('All options must have a title and at least one non-empty value');
					optionsError = 'All options must have a title and at least one non-empty value';
					return;
				}

				let formdata = new FormData();
				formdata.append('productName', $form.productName);
				formdata.append('category', $form.category.split(' -&- ')[0]);
				formdata.append('brand', $form.brand.split(' -&- ')[0]);
				formdata.append('price', $form.price);
				formdata.append('stock', String($form.stock));
				formdata.append('HSNCode', $form.HSNCode);
				formdata.append('productCode', $form.productCode);
				formdata.append('description', $form.description);
				for (let img of files) {
					formdata.append('images', img);
				}
				formdata.append('existingImages', JSON.stringify(existingImages));
				formdata.append('topSeller', $form.topSeller.toString());
				formdata.append('gst', $form.gst);
				formdata.append('options', JSON.stringify(options));
				formdata.append('specifications', JSON.stringify(selectedSpecifications));

				console.log('Form Data:', Object.fromEntries(formdata.entries()));
				$createProductMutation.mutate(formdata);
			},
		}
	);

	// Options handlers
	function addOption() {
		if (!canAddOption()) {
			toast.error('Please fill all existing option fields before adding a new one');
			optionsError = 'Please fill all existing option fields before adding a new one';
			return;
		}
		options = [...options, { title: '', values: [] }];
		optionsError = null;
	}

	function removeOption(index: number) {
		options = options.filter((_, i) => i !== index);
		optionsError = null;
	}

	function updateOptionTitle(index: number, title: string) {
		options = options.map((opt, i) => (i === index ? { ...opt, title } : opt));
		optionsError = null;
	}

	function updateOptionValues(index: number, values: string[]) {
		options = options.map((opt, i) => (i === index ? { ...opt, values } : opt));
		optionsError = null;
	}

	function toggleSpecification(specName: string) {
		const spec = $specificationsQuery.data?.specifications.find((s: { name: string }) => s.name === specName);
		if (!spec) return;

		const isSelected = selectedSpecifications.some((s) => s.name === spec.name);
		if (isSelected) {
			selectedSpecifications = selectedSpecifications.filter((s) => s.name !== spec.name);
		} else {
			const existingSpec = selectedSpecifications.find((s) => s.name === spec.name);
			if (!existingSpec) {
				selectedSpecifications = [
					...selectedSpecifications,
					{
						id: spec._id || spec.name,
						name: spec.name,
						fields: Object.fromEntries(
							spec.fields.map((field: any) => [field, existingSpec?.fields[field] || ''])
						),
					},
				];
			}
		}
	}

	// Specification popup handlers
	function handleAddSpecField() {
		if (currentSpecField.trim()) {
			specFields = [...specFields, currentSpecField];
			$specForm.fields = specFields; 
			currentSpecField = '';
		}
	}

	function handleRemoveSpecField(index: number) {
		specFields = specFields.filter((_, i) => i !== index);
		$specForm.fields = specFields; 
	}

	function closeSpecPopup() {
		showSpecPopup = false;
		newSpecName = '';
		specFields = [];
		currentSpecField = '';
		$specForm.name = '';
		$specForm.fields = [];
		specReset(); // Reset form to clear validation errors
	}

	function openSpecPopup() {
		showSpecPopup = true;
		selectOpen = false;
	}
</script>

<div class="max-w-[95%] mx-auto text-maintext h-[calc(100vh-60px)] overflow-y-auto hidescrollbarthumb">
	<form method="POST" use:enhance class="grid gap-4 py-4 grid-cols-2">
		<div class="col-span-2 bg-zinc-200 text-zinc-900 p-2 rounded-md select-none" id="productformcreate">
			<p class="font-bold">Product Details</p>
		</div>

		<div class="col-span-2 flex flex-col gap-2">
			<Label for="topSeller">Top Seller</Label>
			<Switch
				id="topSeller"
				class="mt-1"
				aria-invalid={$errors.topSeller ? 'true' : undefined}
				bind:checked={$form.topSeller}
				{...$constraints.topSeller}
			/>
			{#if $errors.topSeller}
				<span class="invalid text-xs text-red-500">{$errors.topSeller}</span>
			{/if}
		</div>

		<div>
			<Label>Product Name</Label>
			<Input
				class="pr-10 mt-1"
				autocomplete="off"
				placeholder="Ex: Roller Bandage"
				aria-invalid={$errors.productName ? 'true' : undefined}
				bind:value={$form.productName}
				{...$constraints.productName}
			/>
			{#if $errors.productName}
				<span class="invalid text-xs text-red-500">{$errors.productName}</span>
			{/if}
		</div>
		<div>
			<Label for="productCode">Product Code</Label>
			<Input
				id="productCode"
				autocomplete="off"
				class="pr-10 mt-1 uppercase"
				placeholder="Ex: RB001"
				aria-invalid={$errors.productCode ? 'true' : undefined}
				bind:value={$form.productCode}
				{...$constraints.productCode}
				maxlength={14}
			/>
			{#if $errors.productCode}
				<span class="invalid text-xs text-red-500">{$errors.productCode}</span>
			{/if}
		</div>
		<div>
			<Label for="category">Category</Label>
			<Select.Root
				type="single"
				name="category"
				bind:value={$form.category}
				onValueChange={(value) => {
					$form.category = value;
				}}
			>
				<Select.Trigger class="pr-10 mt-1">
					{$form.category
						? $form.category.includes(' -&- ')
							? $form.category.split(' -&- ')[1]
							: $form.category
						: 'Select Category'}
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						<Select.GroupHeading>Categories</Select.GroupHeading>
						{#each $categoryQuery.data?.categories || [] as category}
							<Select.Item value={`${category._id} -&- ${category.name}`} label={category.name}>
								{category.name}
							</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
			{#if $errors.category}
				<span class="invalid text-xs text-red-500">{$errors.category}</span>
			{/if}
		</div>
		<div>
			<Label for="brand">Brand</Label>
			<Select.Root
				type="single"
				name="brand"
				bind:value={$form.brand}
				onValueChange={(value) => {
					$form.brand = value;
				}}
			>
				<Select.Trigger class="pr-10 mt-1">
					{$form.brand
						? $form.brand.includes(' -&- ')
							? $form.brand.split(' -&- ')[1]
							: $form.brand
						: 'Select Brand'}
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						<Select.GroupHeading>Brands</Select.GroupHeading>
						{#each $brandQuery.data?.brand || [] as brand}
							<Select.Item value={`${brand._id} -&- ${brand.name}`} label={brand.name}>
								{brand.name}
							</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
			{#if $errors.brand}
				<span class="invalid text-xs text-red-500">{$errors.brand}</span>
			{/if}
		</div>
		<div>
			<Label for="price">Price</Label>
			<Input
				id="price"
				autocomplete="off"
				type="text"
				class="pr-10 mt-1"
				placeholder="Ex: 300"
				aria-invalid={$errors.price ? 'true' : undefined}
				bind:value={$form.price}
				onkeypress={(e) => {
					const char = e.key;
					if (!/[0-9]/.test(char)) {
						e.preventDefault();
					}
				}}
				{...$constraints.price}
			/>
			{#if $errors.price}
				<span class="invalid text-xs text-red-500">{$errors.price}</span>
			{/if}
		</div>
		<div>
			<Label for="stock">Available Stock (qty)</Label>
			<Input
				id="stock"
				autocomplete="off"
				type="text"
				class="pr-10 mt-1"
				placeholder="Ex: 40"
				aria-invalid={$errors.stock ? 'true' : undefined}
				bind:value={$form.stock}
				onkeypress={(e) => {
					const char = e.key;
					if (!/[0-9]/.test(char)) {
						e.preventDefault();
					}
				}}
				{...$constraints.stock}
			/>
			{#if $errors.stock}
				<span class="invalid text-xs text-red-500">{$errors.stock}</span>
			{/if}
		</div>
		<div>
			<Label for="gst">GST (%)</Label>
			<Input
				id="gst"
				autocomplete="off"
				type="text"
				class="pr-10 mt-1"
				placeholder="Ex: 1"
				aria-invalid={$errors.gst ? 'true' : undefined}
				bind:value={$form.gst}
				onkeypress={(e) => {
					const char = e.key;
					if (!/[0-9]/.test(char)) {
						e.preventDefault();
					}
				}}
				{...$constraints.gst}
			/>
			{#if $errors.gst}
				<span class="invalid text-xs text-red-500">{$errors.gst}</span>
			{/if}
		</div>
		<div>
			<Label for="HSNCode">HSN Code</Label>
			<Input
				id="HSNCode"
				autocomplete="off"
				type="text"
				class="pr-10 mt-1"
				placeholder="Ex: 0704.2.00"
				aria-invalid={$errors.HSNCode ? 'true' : undefined}
				bind:value={$form.HSNCode}
				onkeypress={(e) => {
					const char = e.key;
					if (!/[0-9.]/.test(char)) {
						e.preventDefault();
					}
				}}
				{...$constraints.HSNCode}
			/>
			{#if $errors.HSNCode}
				<span class="invalid text-xs text-red-500">{$errors.HSNCode}</span>
			{/if}
		</div>

		<!-- Specifications Section -->
		<div>
			<Label for="specifications">Specifications</Label>
			<Select.Root bind:open={selectOpen}>
				<Select.Trigger class="pr-10 mt-1 w-full">
					Select Specifications
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						<Select.GroupHeading>
							<div class="flex justify-between">
								<p>Specifications</p>
								<button
									type="button"
									class="py-1 px-3 rounded-lg text-white cursor-pointer bg-[#01A0E2]"
									onclick={openSpecPopup}
								>
									Add new
								</button>
							</div>
						</Select.GroupHeading>
						{#each $specificationsQuery.data?.specifications || [] as spec}
							<div class="flex items-center px-2 py-1">
								<input
									type="checkbox"
									autocomplete="off"
									id={spec.name}
									checked={selectedSpecifications.some((s) => s.name === spec.name)}
									onchange={() => toggleSpecification(spec.name)}
									class="mr-2"
								/>
								<label for={spec.name} class="flex-1">{spec.name}</label>
							</div>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		</div>

		{#each selectedSpecifications as spec, index}
			<div class="mb-6 p-4 bg-gray-50 rounded-lg shadow-sm">
				<div class="flex justify-between items-center mb-4">
					<h3 class="text-lg font-semibold text-gray-700">{spec.name}</h3>
					<button
						type="button"
						class="bg-red-500 text-white px-3 py-1.5 rounded-md text-sm hover:bg-red-600 transition-colors"
						onclick={() => toggleSpecification(spec.name)}
					>
						Remove
					</button>
				</div>
				{#each Object.entries(spec.fields) as [field, value]}
					<div class="flex flex-col gap-2 mb-4">
						<Label class="text-sm font-medium text-gray-600">{field}</Label>
						<Input
							bind:value={spec.fields[field]}
							autocomplete="off"
							placeholder={`Enter ${field}`}
							class="w-full"
						/>
					</div>
				{/each}
			</div>
		{/each}

		<div class="col-span-2">
			<Label for="description">Description</Label>
			<Textarea
				id="description"
				class="pr-10 mt-1"
				placeholder="Ex: Fundamental tool is first aid and medical care"
				rows={5}
				aria-invalid={$errors.description ? 'true' : undefined}
				bind:value={$form.description}
				{...$constraints.description}
			/>
			{#if $errors.description}
				<span class="invalid text-xs text-red-500">{$errors.description}</span>
			{/if}
		</div>

		<div class="col-span-2">
			<Label>Images</Label>
			<button
				type="button"
				class="flex flex-col cursor-pointer justify-center items-center gap-2 h-[130px] bg-zinc-200 rounded-lg border-black border-[1px] w-full mt-2"
				onclick={() => document.getElementById('files')?.click()}
			>
				<Icon icon={'gravity-ui:files'} class="w-[50px] h-[50px] text-zinc-700" />
				<h4 class="text-gray-700">Click to Upload Files</h4>
				<h6 class="text-sm text-gray-500">(96 X 69) ~ 2 mb</h6>
			</button>

			<div class="flex flex-wrap gap-2 p-2">
				{#if edit && existingImages.length > 0}
					{#each existingImages as image}
						<div class="relative">
							<img
								class="w-[100px] h-[100px] object-cover rounded-md"
								src={`${imgUrl}${image}`}
								alt="Existing product"
							/>
							<button
								type="button"
								class="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 rounded-full p-1"
								onclick={() => {
									existingImages = existingImages.filter((img) => img !== image);
								}}
							>
								<Icon icon="mdi:close" class="w-4 h-4 text-white" />
							</button>
						</div>
					{/each}
				{/if}
				{#each files as file}
					<div class="relative">
						<img
							class="w-[100px] h-[100px] object-cover rounded-md"
							src={URL.createObjectURL(file)}
							alt="New upload"
						/>
						<button
							type="button"
							class="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 rounded-full p-1"
							onclick={() => {
								const newFiles = Array.from(files);
								newFiles.splice(newFiles.indexOf(file), 1);
								files = newFiles;
							}}
						>
							<Icon icon="mdi:close" class="w-4 h-4 text-white" />
						</button>
					</div>
				{/each}
			</div>
			{#if $errors.images}
				<span class="invalid text-xs text-red-500">{$errors.images}</span>
			{/if}
		</div>

		<div class="col-span-2">
			<Label>Options</Label>
			<button
				type="button"
				class="bg-blue-500 text-white px-4 py-2 rounded-md mb-4 disabled:bg-gray-400 disabled:cursor-not-allowed"
				disabled={!canAddOption()}
				onclick={addOption}
				aria-disabled={!canAddOption()}
			>
				<Icon icon="mdi:add" class="w-4 h-4 inline-block mr-1" />
				Add Option
			</button>

			{#each options as option, index}
				<div class="mb-4 p-4 bg-gray-50 rounded-lg shadow-sm">
					<div class="flex justify-end">
						<button
							type="button"
							class="bg-red-500 text-white px-4 py-2 rounded-md"
							onclick={() => removeOption(index)}
						>
							Remove
						</button>
					</div>
					<div class="flex flex-col gap-2">
						<Label for={`option-title-${index}`}>Option Title</Label>
						<Input
							id={`option-title-${index}`}
							class="pr-10 mt-1"
							autocomplete="off"
							placeholder="Option Title (e.g., Size)"
							bind:value={option.title}
							oninput={(e: any) => updateOptionTitle(index, e.target.value)}
						/>
						<Label for={`option-values-${index}`}>Option Values (comma-separated)</Label>
						<Input
							id={`option-values-${index}`}
							class="pr-10 mt-1"
							autocomplete="off"
							placeholder="Option Values (e.g., Small, Medium, Large)"
							value={option.values.join(', ')}
							oninput={(e: any) => {
								const values = e.target.value
									.split(',')
									.map((v: string) => v.trim())
									.filter((v: string) => v !== '');
								updateOptionValues(index, values);
							}}
						/>
					</div>
				</div>
			{/each}
			{#if optionsError}
				<span class="invalid text-xs text-red-500">{optionsError}</span>
			{/if}
		</div>

		<Button class="w-[100px]" type="submit" disabled={$createProductMutation.isPending}>
			{$createProductMutation.isPending
				? edit
					? 'Updating...'
					: 'Creating...'
				: edit
				? 'Update'
				: 'Create'}
		</Button>
	</form>

	<Input
		type="file"
		class="hidden"
		accept=".jpg, .jpeg, .png, .webp"
		multiple
		id="files"
		onchange={async (e: any) => {
			const newFiles = Array.from(e.target.files) as File[];
			for (const file of newFiles) {
				if (file.size > 1024 * 1024 * 2) {
					toast.error(`Image ${file.name} is too large! Max size is 2 MB`);
					return;
				}
			}
			const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
			const invalidFiles = newFiles.filter((file) => !validImageTypes.includes(file.type));
			if (invalidFiles.length > 0) {
				toast.error('Please upload only JPG, JPEG, PNG, or WEBP images.');
				return;
			}
			files = newFiles;
		}}
	/>

	<!-- Specification Creation Popup -->
	{#if showSpecPopup}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div class="bg-white p-6 rounded-lg shadow-lg max-w-lg w-full">
				<h2 class="text-xl text-black font-semibold mb-4">Create New Specification</h2>
				<form method="POST" use:specEnhance class="grid gap-4">
					<div>
						<Label for="specName">Specification Name</Label>
						<Input
							id="specName"
							autocomplete="off"
							class="pr-10 mt-1"
							placeholder="Ex: Material"
							aria-invalid={$specErrors.name ? 'true' : undefined}
							bind:value={$specForm.name}
							oninput={() => (newSpecName = $specForm.name)} 
							{...$specConstraints.name}
						/>
						{#if $specErrors.name}
							<span class="invalid text-xs text-red-500">{$specErrors.name}</span>
						{/if}
					</div>

					{#each specFields as field, index}
						<div class="flex items-center gap-2">
							<div class="flex-1">
								<Label>Field {index + 1}</Label>
								<Input
									bind:value={specFields[index]}
									oninput={() => ($specForm.fields = specFields)} 
									class="pr-10 mt-1"
									placeholder="Ex: Field Value"
									aria-invalid={$specErrors.fields?.[index] ? 'true' : undefined}
									{...$specConstraints.fields?.[index]}
								/>
								{#if $specErrors.fields?.[index]}
									<span class="invalid text-xs text-red-500">{$specErrors.fields[index]}</span>
								{/if}
							</div>
							<button
								type="button"
								onclick={() => handleRemoveSpecField(index)}
								class="mt-6 text-white hover:bg-red-700 bg-red-500 h-6 w-6 flex justify-center items-center rounded-full border border-white"
							>
								<Icon icon="material-symbols:close-rounded" class="text-white" />
							</button>
						</div>
					{/each}

					<div>
						<Label for="newSpecField">New Field</Label>
						<div class="flex gap-2">
							<Input
								id="newSpecField"
								bind:value={currentSpecField}
								class="pr-10 mt-1"
								placeholder="Ex: New Field"
							/>
							<Button type="button" onclick={handleAddSpecField} class="mt-1">
								Add Field
							</Button>
						</div>
					</div>

					<div class="flex justify-end gap-2 mt-4">
						<Button type="button" variant="outline" class="text-black" onclick={closeSpecPopup}>
							Cancel
						</Button>
						<Button type="submit" disabled={$createSpecificationMutation.isPending}>
							{$createSpecificationMutation.isPending ? 'Saving...' : 'Save'}
							<Icon icon="zondicons:add-outline" class="text-white ml-2" />
						</Button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<div class="h-[100px] text-transparent"></div>
</div>
