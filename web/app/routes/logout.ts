import { redirect } from "react-router";
import { clearedCookie } from "../session.server";

export function loader() {
  return redirect("/");
}

export function action() {
  return redirect("/login", { headers: { "Set-Cookie": clearedCookie } });
}
