import { AddToCart } from "../add-to-cart";
import { catalog } from "../store.server";

export function meta() {
  return [{ title: "Store" }];
}

// Public: anyone can browse. Adding to the cart needs a session, which the cart API checks.
export function ServerComponent() {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Store</h1>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {catalog.map((p) => (
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
    </main>
  );
}
