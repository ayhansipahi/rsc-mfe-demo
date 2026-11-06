// The store vertical's photo search. The mobile shell's camera hands a photo to the page; the page
// posts it here with its session cookie, and a vision model on Bedrock names the catalog products
// in it. Resource route, so like the cart contract it requires a JSON body (a cross-site form cannot
// send one without a preflight) on top of the SameSite=Lax session cookie.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { getUser } from "@rsc-mfe/shell/session.server";
import { catalog, isProduct } from "../catalog";

const noStore = { "Cache-Control": "private, no-store" };
const modelId = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";
let bedrock: BedrockRuntimeClient | undefined;

const system = `You match a photo to the products of a small store. Catalog, as id: name: ${catalog
  .map((p) => `${p.id}: ${p.name}`)
  .join("; ")}. Reply with only JSON, {"ids": [...]}: the ids of catalog products visible in the photo, best match first, at most 3. None visible: {"ids": []}.`;

export async function action({ request }: { request: Request }) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "JSON body required" }, { status: 415, headers: noStore });
  }
  // Every search is a paid model call: signed-in users only, and one photo of at most 1 MB (the
  // shell sends about 100 KB).
  const user = await getUser(request);
  if (!user) return Response.json({ error: "sign-in required" }, { status: 401, headers: noStore });
  const { photo } = (await request.json().catch(() => ({}))) as { photo?: unknown };
  const bytes = Buffer.from(typeof photo === "string" ? photo : "", "base64");
  if (!bytes.length || bytes.length > 1_000_000) {
    return Response.json({ error: "one JPEG photo up to 1 MB" }, { status: 413, headers: noStore });
  }

  const out = await (bedrock ??= new BedrockRuntimeClient({})).send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ image: { format: "jpeg", source: { bytes } } }, { text: "Which catalog products are in this photo?" }] }],
      inferenceConfig: { maxTokens: 100, temperature: 0 },
    }),
  );
  const text = out.output?.message?.content?.find((c) => c.text)?.text ?? "";
  let ids: unknown = [];
  try {
    ids = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}").ids;
  } catch {}
  // Only catalog ids leave this route: whatever the model says, the page links to known products.
  const found = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && isProduct(id)) : [];
  return Response.json({ ids: found.slice(0, 3) }, { headers: noStore });
}
