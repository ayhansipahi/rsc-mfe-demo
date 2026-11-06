import { isRouteErrorResponse, Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import { Document, Page } from "@rsc-mfe/shell/layout";
import { chrome } from "@rsc-mfe/shell/chrome.server";

import type { Route } from "./+types/root";
import "./app.css";

// The chrome is per client: the mobile shell announces itself in the User-Agent and draws its own
// tab bar, so its pages render without the web header and footer. This distribution's cache policy
// has a default TTL of 0, so the two variants never share a cache entry.
export async function loader({ request }: Route.LoaderArgs) {
  return {
    // Who is signed in and the cart count, so the header's server HTML is not bare.
    ...(await chrome(request)),
    shell: (request.headers.get("user-agent") ?? "").includes("RSCShell/"),
    stitch: new URL(request.url).searchParams.has("stitch"),
    // Where the shell's header and footer scripts come from: "" on the shared host, a dev server
    // when this app runs on its own, unset for a page with empty slots.
    shellOrigin: process.env.SHELL_ORIGIN ?? "",
  };
}

// The User-Agent does not change between navigations and active links are computed on the client,
// so a link click does not need the root loader again. Form submits still revalidate.
export function shouldRevalidate({ formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return formMethod ? defaultShouldRevalidate : false;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return <Document>{children}</Document>;
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <Page shell={loaderData.shell} owner="orders" build={__BUILD__} shellOrigin={loaderData.shellOrigin} stitch={loaderData.stitch} email={loaderData.email} cartCount={loaderData.cartCount}>
      <Outlet />
    </Page>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details = error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container p-4 pt-16 mx-auto">
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="overflow-x-auto p-4 w-full">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
