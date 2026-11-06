// What the header's server HTML can say before the fragments run: who is signed in (from the
// cookie, no network) and the cart count, read from the store's published contract with the
// request's cookie forwarded, the same call the mini-cart makes from the browser. Best effort: an
// absent store (an app running on its own) or a slow one leaves the count out, never the page.
import { getUser as sessionUser } from "./session.server.ts";

export interface Chrome {
  email: string | null;
  cartCount: number | null;
}

// ponytail: 1.5s cap, the page waits for the store at most this long; tune if the badge is often missing.
const CART_TIMEOUT_MS = 1500;

export async function chrome(
  request: Request,
  { getUser = sessionUser, fetch = globalThis.fetch }: { getUser?: typeof sessionUser; fetch?: typeof globalThis.fetch } = {},
): Promise<Chrome> {
  const user = await getUser(request);
  if (!user) return { email: null, cartCount: null };
  // Through the public host in production (another team's function), this app's own origin locally.
  const base = process.env.PUBLIC_HOST ? `https://${process.env.PUBLIC_HOST}` : request.url;
  const cartCount = await fetch(new URL("/store/api/cart", base), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
    signal: AbortSignal.timeout(CART_TIMEOUT_MS),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((cart) => (cart ? Number(cart.count) : null))
    .catch(() => null);
  return { email: user.username, cartCount };
}
