import { redirect } from "react-router";
import { CartChanged } from "../cart-changed";
import { getUser } from "../session.server";
import { countOf, getCart, removeLine, type CartLine } from "../store.server";
import { buttonClass } from "../styles";

export function meta() {
  return [{ title: "Cart" }];
}

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request }: { request: Request }) {
  const user = await getUser(request);
  if (!user) throw redirect("/login?next=/store/cart");
  return { lines: await getCart(user.sub) };
}

export async function action({ request }: { request: Request }) {
  const user = await getUser(request);
  if (!user) throw redirect("/login?next=/store/cart");
  const form = await request.formData();
  await removeLine(user.sub, String(form.get("productId") ?? ""));
  // Redirect, not data: in RSC mode a submission skips the loaders in the same request
  // (React Router 8.5.1), so a document POST would render this page without loaderData.
  return redirect("/store/cart");
}

export function ServerComponent({ loaderData }: { loaderData: { lines: CartLine[] } }) {
  const { lines } = loaderData;
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Cart</h1>
      <CartChanged count={countOf(lines)} />
      {lines.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          Your cart is empty. <a href="/store" className="underline">Browse the store</a>.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {lines.map((l) => (
              <li key={l.productId} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{l.name}</p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {l.qty} x {l.price.toFixed(2)}
                  </p>
                </div>
                <form method="post">
                  <input type="hidden" name="productId" value={l.productId} />
                  <button type="submit" className={buttonClass}>
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="text-right font-medium">Total {total.toFixed(2)}</p>
        </>
      )}
    </main>
  );
}
