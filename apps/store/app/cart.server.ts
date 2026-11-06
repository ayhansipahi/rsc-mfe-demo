// The store app keeps its cart in the store team's cart service, forwarding the user's access
// token. The service stores ids and quantities; names and prices come from this app's catalog.
import { catalog } from "./catalog.ts";

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export const countOf = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);

async function call(user: { token: string }, path: string, method = "GET"): Promise<Response> {
  const r = await fetch(`${process.env.CART_API_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${user.token}` },
  }).catch(() => null);
  if (!r?.ok) throw new Response("cart service unavailable", { status: 502 });
  return r;
}

export async function getCart(user: { token: string }): Promise<CartLine[]> {
  const { lines } = (await (await call(user, "/cart")).json()) as { lines: { productId: string; qty: number }[] };
  return lines.flatMap((l) => {
    const p = catalog.find((c) => c.id === l.productId);
    return p ? [{ productId: p.id, name: p.name, price: p.price, qty: l.qty }] : [];
  });
}

export async function addLine(user: { token: string }, productId: string) {
  await call(user, `/cart/${productId}`, "PUT");
}

export async function removeLine(user: { token: string }, productId: string) {
  await call(user, `/cart/${productId}`, "DELETE");
}
