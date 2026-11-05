import { redirect } from "react-router";
import { RegisterPasskey } from "../register-passkey";
import { getUser } from "../session.server";
import { buttonClass } from "../styles";

export function meta() {
  return [{ title: "Account" }];
}

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request }: { request: Request }) {
  const user = await getUser(request);
  if (!user) throw redirect("/login?next=/account");
  return { email: user.username };
}

// The account vertical's own page: everything about the session lives next to the code that
// issues it (/login, /logout, /auth/passkey), not on another vertical's page.
export function ServerComponent({ loaderData }: { loaderData: { email: string } }) {
  return (
    <main className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-neutral-600 dark:text-neutral-400">{loaderData.email}</p>
      </div>
      <RegisterPasskey />
      <form method="post" action="/logout" className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <button type="submit" className={buttonClass}>
          Sign out
        </button>
      </form>
    </main>
  );
}
