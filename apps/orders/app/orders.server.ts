// The orders app reads its data from the orders team's service, forwarding the user's access token.
// No table access here: the service's role is the only thing that can Query the rows.
export interface Order {
  orderId: string;
  item: string;
  total: string;
}

export async function listOrders(user: { token: string }): Promise<Order[]> {
  const r = await fetch(`${process.env.ORDERS_API_URL}/orders`, {
    headers: { authorization: `Bearer ${user.token}` },
  }).catch(() => null);
  if (!r?.ok) throw new Response("orders service unavailable", { status: 502 });
  return (await r.json()) as Order[];
}
