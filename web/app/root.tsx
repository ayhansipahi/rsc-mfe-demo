import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { Nav } from "./nav";
import { PhotoSearch } from "./photo-search";
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

// Browsers keep pinch-zoom for accessibility. Inside the shell the page is the app's screen, so
// zoom is off there: a WKWebView honours maximum-scale and user-scalable unless the app opts out.
// React hoists this <meta> into <head>.
const viewport = "width=device-width, initial-scale=1";
const shellViewport = `${viewport}, maximum-scale=1, user-scalable=no`;

// Each fragment's script comes from the vertical that owns it, so the store team can change the mini
// cart without redeploying the verticals that show it. React hoists async scripts into <head>.
function FragmentScripts() {
  return (
    <>
      <script type="module" src="/fragments/account-button.js" async />
      <script type="module" src="/store-static/fragments/mini-cart.js" async />
    </>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <meta name="viewport" content={loaderData.shell ? shellViewport : viewport} />
      <FragmentScripts />
      {/* In the shell the fragments draw nothing; they report the session and the cart count to
          the native tab bar. On the web they sit in the nav. */}
      {loaderData.shell ? (
        <>
          <div hidden>
            <rsc-account-button />
            <rsc-mini-cart />
          </div>
          {/* Listens for the shell camera's photo on any page of the Store tab. */}
          <PhotoSearch />
        </>
      ) : (
        <Nav />
      )}
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
      <meta name="viewport" content={viewport} />
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
