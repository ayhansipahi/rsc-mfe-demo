import { redirect } from "react-router";
import { passwordSignIn } from "../cognito.server";
import { LoginForm } from "../login-form";
import { getUser, sessionCookie } from "../session.server";

export function meta() {
  return [{ title: "Sign in" }];
}

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request }: { request: Request }) {
  if (await getUser(request)) throw redirect("/orders");
  return { error: new URL(request.url).searchParams.get("error") };
}

// Password path: plain form POST, then POST/redirect/GET with the cookie on the redirect.
export async function action({ request }: { request: Request }) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const token = await passwordSignIn(email, password).catch(() => null);
  if (!token) return redirect("/login?error=password");
  return redirect("/orders", { headers: { "Set-Cookie": sessionCookie(token) } });
}

export function ServerComponent({ loaderData }: { loaderData: { error: string | null } }) {
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <LoginForm error={loaderData.error} />
    </main>
  );
}
