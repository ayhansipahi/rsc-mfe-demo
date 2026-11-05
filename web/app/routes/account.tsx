import { redirect } from "react-router";
import { listPasskeys } from "../cognito.server";
import { RegisterPasskey } from "../register-passkey";
import { getUser } from "../session.server";
import { buttonClass } from "../styles";

interface Passkey {
  id: string;
  name: string;
  added: string;
}

export function meta() {
  return [{ title: "Account" }];
}

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request }: { request: Request }) {
  const user = await getUser(request);
  if (!user) throw redirect("/login?next=/account");
  // If Cognito cannot answer, show the add button as before: it is the safe default.
  const passkeys: Passkey[] = await listPasskeys(user.token)
    .then((list) =>
      list.map((c) => ({
        id: c.CredentialId ?? "",
        name: c.FriendlyCredentialName || "Passkey",
        added: c.CreatedAt?.toISOString().slice(0, 10) ?? "",
      })),
    )
    .catch((error) => {
      console.error("listPasskeys failed", error);
      return [];
    });
  return { email: user.username, passkeys };
}

// The account vertical's own page: everything about the session lives next to the code that
// issues it (/login, /logout, /auth/passkey), not on another vertical's page.
export function ServerComponent({ loaderData }: { loaderData: { email: string; passkeys: Passkey[] } }) {
  const { email, passkeys } = loaderData;
  return (
    <main className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-neutral-600 dark:text-neutral-400">{email}</p>
      </div>
      {passkeys.length > 0 ? (
        <div className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <p className="font-medium">Passkeys</p>
          <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
            {passkeys.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.added && `, added ${p.added}`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <RegisterPasskey />
      )}
      <form method="post" action="/logout" className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <button type="submit" className={buttonClass}>
          Sign out
        </button>
      </form>
    </main>
  );
}
