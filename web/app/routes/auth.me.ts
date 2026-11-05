// The account vertical's published session contract, read by its account-button fragment on any
// vertical's page. It says who is signed in; it never returns the token.
import { getUser } from "../session.server";

export async function loader({ request }: { request: Request }) {
  const user = await getUser(request);
  return Response.json(user ? { signedIn: true, email: user.username } : { signedIn: false }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
