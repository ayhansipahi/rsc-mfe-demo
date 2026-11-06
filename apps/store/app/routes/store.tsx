import { AddToCart } from "../add-to-cart";
import { catalog, isProduct } from "../catalog";

export function meta() {
  return [{ title: "Store" }];
}

// ?match= carries a photo search's result as product ids (see store.api.photo-search.ts). Only ids
// travel in the URL; the names on the page come from the catalog.
export function loader({ request }: { request: Request }) {
  const match = new URL(request.url).searchParams.get("match");
  return { match: match === null ? null : [...new Set(match.split(",").filter(isProduct))] };
}

// Public: anyone can browse. Adding to the cart needs a session, which the cart API checks.
export function ServerComponent({ loaderData }: { loaderData: { match: string[] | null } }) {
  const { match } = loaderData;
  const products = match ? match.map((id) => catalog.find((p) => p.id === id)!) : catalog;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Store</h1>
      {match && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {match.length ? "From your photo." : "Nothing in the store looks like that."}{" "}
          <a href="/store" className="underline">
            Show all products
          </a>
        </p>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {products.map((p) => (
          <li key={p.id} className="flex items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className={`size-12 shrink-0 rounded-md ${p.tone}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{p.price.toFixed(2)}</p>
            </div>
            <AddToCart productId={p.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
