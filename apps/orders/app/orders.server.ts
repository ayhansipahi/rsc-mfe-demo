// The orders app reads its data from the orders team's service, forwarding the user's access token (SigV4-signed: the service endpoint is IAM-only).
// No table access here: the service's role is the only thing that can Query the rows.
import { serviceFetch } from "@rsc-mfe/shell/service-fetch.server";
import type { SessionUser } from "@rsc-mfe/shell/session.server";
export interface Order {
  orderId: string;
  item: string;
  total: string;
}

export async function listOrders(user: Pick<SessionUser, "token" | "flow">): Promise<Order[]> {
  const r = await serviceFetch(
    `${process.env.ORDERS_API_URL}/orders`,
    // A service that accepts the connection and stalls must not hang the page: fail into the 502 below.
    { signal: AbortSignal.timeout(Number(process.env.SERVICE_TIMEOUT_MS ?? 5000)) },
    user,
  ).catch(() => null);
  if (!r?.ok) throw new Response("orders service unavailable", { status: 502 });
  return (await r.json()) as Order[];
}
