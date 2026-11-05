// Server half of both passkey ceremonies. The browser sends the raw WebAuthn JSON; this
// route forwards it to Cognito and turns the result into the session cookie.
import { passkeyRegisterFinish, passkeyRegisterStart, passkeySignInFinish, passkeySignInStart } from "../cognito.server";
import { getUser, signInCookies } from "../session.server";

const noStore = { "Cache-Control": "private, no-store" };

export async function loader() {
  return new Response("method not allowed", { status: 405 });
}

export async function action({ request }: { request: Request }) {
  const body = await request.json().catch(() => ({}));
  try {
    switch (body.intent) {
      case "signin-start":
        return Response.json(await passkeySignInStart(String(body.email)), { headers: noStore });
      case "signin-finish": {
        const token = await passkeySignInFinish(String(body.email), String(body.session), body.credential);
        return new Response(null, { status: 204, headers: signInCookies(token, String(body.email), new Headers(noStore)) });
      }
      case "register-start": {
        const user = await getUser(request);
        if (!user) return new Response("unauthorized", { status: 401 });
        return Response.json({ options: await passkeyRegisterStart(user.token) }, { headers: noStore });
      }
      case "register-finish": {
        const user = await getUser(request);
        if (!user) return new Response("unauthorized", { status: 401 });
        await passkeyRegisterFinish(user.token, body.credential);
        return new Response(null, { status: 204, headers: noStore });
      }
      default:
        return new Response("unknown intent", { status: 400 });
    }
  } catch (e) {
    // Cognito's message is fine for a demo; a product would map these.
    return new Response(e instanceof Error ? e.message : "auth failed", { status: 400, headers: noStore });
  }
}
