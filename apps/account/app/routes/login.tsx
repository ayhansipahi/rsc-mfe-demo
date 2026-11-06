import { redirect, redirectDocument } from "react-router";
import { passwordSignIn } from "../cognito.server";
import { LoginForm } from "../login-form";
import { getUser, readLastEmail, signInCookies } from "@rsc-mfe/shell/session.server";

export function meta() {
  return [{ title: "Sign in" }];
}

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

// Only same-origin paths: an absolute or protocol-relative "next" would turn this into an open redirect.
const safeNext = (value: unknown) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : "/orders";

export async function loader({ request }: { request: Request }) {
  const params = new URL(request.url).searchParams;
  const next = safeNext(params.get("next"));
  if (await getUser(request)) throw redirect(next);
  return { error: params.get("error"), next, remembered: readLastEmail(request) };
}

// Password path: plain form POST, then POST/redirect/GET with the cookie on the redirect.
export async function action({ request }: { request: Request }) {
  const form = await request.formData();
  // Sign-up stores the email lowercased as the username.
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const token = await passwordSignIn(email, password).catch(() => null);
  if (!token) return redirect(`/login?error=password&next=${encodeURIComponent(next)}`);
  // A document load, not a client navigation: every fragment on the next page reads the new session.
  return redirectDocument(next, { headers: signInCookies(token, email) });
}

export function ServerComponent({
  loaderData,
}: {
  loaderData: { error: string | null; next: string; remembered: string | null };
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <LoginForm error={loaderData.error} next={loaderData.next} remembered={loaderData.remembered} />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        New here?{" "}
        <a href="/signup" className="underline">
          Create an account
        </a>
      </p>
    </div>
  );
}
