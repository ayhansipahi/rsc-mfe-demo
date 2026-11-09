// The store app keeps its cart in the store team's cart service, forwarding the user's access
// token. The service stores ids and quantities; names and prices come from this app's catalog.
import { serviceFetch } from "@rsc-mfe/shell/service-fetch.server";
import type { SessionUser } from "@rsc-mfe/shell/session.server";
import { catalog } from "./catalog.ts";

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export const countOf = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);

async function call(user: Pick<SessionUser, "token" | "flow">, path: string, method = "GET"): Promise<Response> {
  const r = await serviceFetch(
    `${process.env.CART_API_URL}${path}`,
    // A service that accepts the connection and stalls must not hang the page: fail into the 502 below.
    { method, signal: AbortSignal.timeout(Number(process.env.SERVICE_TIMEOUT_MS ?? 5000)) },
    user,
  ).catch(() => null);
  if (!r?.ok) throw new Response("cart service unavailable", { status: 502 });
  return r;
}

export async function getCart(user: Pick<SessionUser, "token" | "flow">): Promise<CartLine[]> {
  const { lines } = (await (await call(user, "/cart")).json()) as { lines: { productId: string; qty: number }[] };
  return lines.flatMap((l) => {
    const p = catalog.find((c) => c.id === l.productId);
    return p ? [{ productId: p.id, name: p.name, price: p.price, qty: l.qty }] : [];
  });
}

export async function addLine(user: Pick<SessionUser, "token" | "flow">, productId: string) {
  await call(user, `/cart/${productId}`, "PUT");
}

export async function removeLine(user: Pick<SessionUser, "token" | "flow">, productId: string) {
  await call(user, `/cart/${productId}`, "DELETE");
}
