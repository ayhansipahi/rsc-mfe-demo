import { redirect, redirectDocument } from "react-router";
import { clearedCookie } from "../session.server";

export function loader() {
  return redirect("/");
}

export function action() {
  // Document load: the fragments on the login page must see the cleared session.
  return redirectDocument("/login", { headers: { "Set-Cookie": clearedCookie } });
}
