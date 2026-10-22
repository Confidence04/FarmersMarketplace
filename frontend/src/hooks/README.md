# Custom Hooks

This directory contains reusable custom hooks for common data fetching and state management patterns.

## Dashboard Hooks

### `useDashboardData(userId)`

Centralized hook for managing all dashboard data loading and polling. Replaces scattered API calls throughout Dashboard component.

**Usage:**
```jsx
import { useDashboardData } from '../hooks/useDashboardData';

function MyComponent() {
  const { products, sales, profile, loading, error, load } = useDashboardData(userId);
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return <div>{/* render data */}</div>;
}
```

**Returns:**
- `products` - Array of farmer's product listings
- `sales` - Array of orders/sales records  
- `profile` - Farmer profile object
- `bundles` - Bundle product groupings
- `cooperatives` - Cooperative memberships
- `harvestBatches` - Available harvest batches
- `forecastByProduct` - Demand forecast data by product ID
- `waitlistAnalytics` - Product waitlist metrics
- `bundleDiscounts` - Tiered discount rules
- `pendingTxs` - Unsigned blockchain transactions
- `earnings` - Creator earnings balance
- `loading` - Boolean indicating data fetch in progress
- `error` - Error message if fetch failed
- `load()` - Function to manually refetch all data
- `setters` - Functions to update individual state values
- `productsRef` - Ref for polling comparison

**Features:**
- Parallel API calls for efficiency
- Low stock polling with toast notifications
- Request deduplication
- Error handling with user-friendly messages

---

## Marketplace Hooks

### `useProducts(filters)`

Fetches products list with optional filters, pagination, and request cancellation.

**Usage:**
```jsx
import { useProducts } from '../hooks/useProducts';

function Marketplace() {
  const filters = { category: 'vegetables', limit: 20 };
  const { products, loading, error, pagination, refetch } = useProducts(filters);
  
  return (
    <>
      {products.map(p => <ProductCard key={p.id} product={p} />)}
      {pagination.pages > 1 && <Pagination {...pagination} onPageChange={refetch} />}
    </>
  );
}
```

**Returns:**
- `products` - Array of products matching filters
- `loading` - Boolean indicating fetch in progress
- `error` - Error message if fetch failed
- `pagination` - Object with `{ page, pages, total }`
- `refetch(filters, page)` - Function to manually refetch with updated filters

**Features:**
- AbortController support for request cancellation
- Automatic retry on component unmount
- Filter caching and deduplication

---

### `useProduct(productId)`

Fetches single product details by ID with request cancellation support.

**Usage:**
```jsx
import { useProduct } from '../hooks/useProduct';

function ProductDetail({ productId }) {
  const { product, loading, error, refetch } = useProduct(productId);
  
  if (!product) return null;
  
  return (
    <>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <button onClick={() => refetch()}>Refresh</button>
    </>
  );
}
```

**Returns:**
- `product` - Single product object or null
- `loading` - Boolean indicating fetch in progress
- `error` - Error message if fetch failed
- `refetch(productId)` - Function to manually refetch with optionally different productId

**Features:**
- Graceful null handling for missing products
- AbortController support for request cancellation
- Support for switching products without component remount

---

### `useReviews(productId)`

Fetches product reviews with pagination support and request cancellation.

**Usage:**
```jsx
import { useReviews } from '../hooks/useReviews';

function ReviewsSection({ productId }) {
  const { reviews, loading, error, pagination, refetch } = useReviews(productId);
  
  return (
    <>
      {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
      <button onClick={() => refetch(productId, 2)}>Load more</button>
    </>
  );
}
```

**Returns:**
- `reviews` - Array of review objects
- `loading` - Boolean indicating fetch in progress
- `error` - Error message if fetch failed
- `pagination` - Object with `{ page, pages, total }`
- `refetch(productId, page)` - Function to manually refetch with optional pagination

**Features:**
- Pagination support
- AbortController support for request cancellation
- Graceful error handling

---

## Best Practices

1. **Use hooks to extract data fetching** - Keep components clean and focused on UI
2. **Cancel requests on unmount** - All hooks include AbortController support
3. **Handle loading states** - Always provide feedback to user during data fetch
4. **Handle errors gracefully** - Display user-friendly error messages
5. **Refetch when needed** - Use `refetch()` to manually update data after mutations
6. **Combine hooks** - Compose multiple hooks for complex features

## Adding New Hooks

When creating new data-fetching hooks:
1. Use `AbortController` for request cancellation
2. Return `{ data, loading, error, refetch }` structure
3. Add JSDoc documentation with usage examples
4. Handle both success and error cases
5. Consider pagination if the data is potentially large
6. Add to this README with examples
