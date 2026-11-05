import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { Nav } from "./nav";
import "./app.css";

// The chrome is per client: the mobile shell announces itself in the User-Agent and draws its own
// tab bar, so its pages render without the web nav. This distribution's cache policy has a default
// TTL of 0, so the two variants never share a cache entry; a caching policy would need the token in its key.
export function loader({ request }: Route.LoaderArgs) {
  return { shell: (request.headers.get("user-agent") ?? "").includes("RSCShell/") };
}

// The User-Agent does not change between navigations and NavLink computes the active state on the
// client, so a link click does not need the root loader again. Form submits still revalidate.
export function shouldRevalidate({ formMethod, defaultShouldRevalidate }: Route.ShouldRevalidateFunctionArgs) {
  return formMethod ? defaultShouldRevalidate : false;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Tells the browser (and the shell's WebView) both themes exist, so the canvas and form
            controls follow the device before the stylesheet applies. */}
        <meta name="color-scheme" content="light dark" />
        <Meta />
        <Links />
      </head>
      <body className="text-neutral-900 dark:text-neutral-100">
        {/* .root isolates stacking so Base UI portals (dialog, tooltip) sit above the page. */}
        <div className="root">{children}</div>
        <ScrollRestoration />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <>
      {loaderData.shell ? null : <Nav />}
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Outlet />
      </div>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container p-4 pt-16 mx-auto">
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
