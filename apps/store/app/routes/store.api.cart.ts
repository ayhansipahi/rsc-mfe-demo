// The store team's published cart contract: cookie in, JSON out; the cart service behind it is
// reached with the user's token. The mini-cart fragment reads it from any vertical's
// page; the store pages write to it. Resource route, so React Router's action CSRF check does not
// apply: writes require a JSON body (a cross-site form cannot send one without a preflight) on top
// of the SameSite=Lax session cookie.
import { getUser } from "@rsc-mfe/shell/session.server";
import { isProduct } from "../catalog";
import { addLine, countOf, getCart, removeLine, type CartLine } from "../cart.server";

const noStore = { "Cache-Control": "private, no-store" };

async function summary(user: { token: string }) {
  const lines: CartLine[] = await getCart(user);
  return Response.json({ signedIn: true, count: countOf(lines), lines }, { headers: noStore });
}

export async function loader({ request }: { request: Request }) {
  const user = await getUser(request);
  if (!user) return Response.json({ signedIn: false, count: 0, lines: [] }, { headers: noStore });
  return summary(user);
}

export async function action({ request }: { request: Request }) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "JSON body required" }, { status: 415, headers: noStore });
  }
  const user = await getUser(request);
  if (!user) return Response.json({ error: "sign-in required" }, { status: 401, headers: noStore });
  const body = (await request.json().catch(() => ({}))) as { intent?: string; productId?: string };
  const productId = String(body.productId ?? "");
  if (!isProduct(productId)) return Response.json({ error: "unknown product" }, { status: 400, headers: noStore });
  if (body.intent === "add") await addLine(user, productId);
  else if (body.intent === "remove") await removeLine(user, productId);
  else return Response.json({ error: "unknown intent" }, { status: 400, headers: noStore });
  return summary(user);
}
