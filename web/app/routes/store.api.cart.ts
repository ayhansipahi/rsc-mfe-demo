// The store vertical's published cart contract. The mini-cart fragment reads it from any vertical's
// page; the store pages write to it. Resource route, so React Router's action CSRF check does not
// apply: writes require a JSON body (a cross-site form cannot send one without a preflight) on top
// of the SameSite=Lax session cookie.
import { getUser } from "../session.server";
import { addLine, countOf, getCart, isProduct, removeLine } from "../store.server";

const noStore = { "Cache-Control": "private, no-store" };

async function summary(sub: string) {
  const lines = await getCart(sub);
  return Response.json({ signedIn: true, count: countOf(lines), lines }, { headers: noStore });
}

export async function loader({ request }: { request: Request }) {
  const user = await getUser(request);
  if (!user) return Response.json({ signedIn: false, count: 0, lines: [] }, { headers: noStore });
  return summary(user.sub);
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
  if (body.intent === "add") await addLine(user.sub, productId);
  else if (body.intent === "remove") await removeLine(user.sub, productId);
  else return Response.json({ error: "unknown intent" }, { status: 400, headers: noStore });
  return summary(user.sub);
}
