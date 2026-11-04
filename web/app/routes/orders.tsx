import { redirect } from "react-router";
import { listOrders, type Order } from "../orders.server";
import { RegisterPasskey } from "../register-passkey";
import { getUser } from "../session.server";
import { buttonClass } from "../styles";

export function meta() {
  return [{ title: "Orders" }];
}

// Personalized: never cached by the CDN.
export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request }: { request: Request }) {
  const user = await getUser(request);
  if (!user) throw redirect("/login");
  return { email: user.username, orders: await listOrders(user) };
}

export function ServerComponent({ loaderData }: { loaderData: { email: string; orders: Order[] } }) {
  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Orders for {loaderData.email}</h1>
        <form method="post" action="/logout">
          <button type="submit" className={buttonClass}>
            Sign out
          </button>
        </form>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-neutral-500">
          <tr>
            <th className="py-1">Order</th>
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {loaderData.orders.map((o) => (
            <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-1 font-mono">{o.id}</td>
              <td className="py-1">{o.item}</td>
              <td className="py-1 text-right">{o.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-neutral-500">
        Fetched by the server component through lambda:InvokeFunction. The service has no URL.
      </p>
      <RegisterPasskey />
    </main>
  );
}
