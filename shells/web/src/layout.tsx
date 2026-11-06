import { Links, Meta, ScrollRestoration } from "react-router";
import { Stitch } from "./stitch";

// The shell's two pieces of every app's root route. Document is the <html> skeleton (an app's
// Layout export). Page draws the three areas the shell owns the shape of: header and footer come
// from the shell's own fragments at runtime, main is the app's.

export function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        {/* Tells the browser (and the mobile shell's WebView) both themes exist, so the canvas and
            form controls follow the device before the stylesheet applies. */}
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

// Browsers keep pinch-zoom for accessibility. Inside the mobile shell the page is the app's screen,
// so zoom is off there: a WKWebView honours maximum-scale and user-scalable unless the app opts out.
// React hoists this <meta> into <head>.
const viewport = "width=device-width, initial-scale=1";
const shellViewport = `${viewport}, maximum-scale=1, user-scalable=no`;

// Site nav, as header.js draws it (same order, same labels).
const pages = [
  ["/", "Home"],
  ["/store", "Store"],
  ["/orders", "Orders"],
] as const;

export interface PageProps {
  /** Inside the native mobile shell (RSCShell/ User-Agent): no web chrome, fragments report to the tab bar. */
  shell: boolean;
  /** The team whose app renders main: "account" | "orders" | "store". */
  owner: string;
  /** The app's build time (Vite define __BUILD__). */
  build: string;
  /** Where header.js and footer.js are fetched from; "" in production (same host). */
  shellOrigin: string;
  /** ?stitch: outline every area with its owner and build time. */
  stitch: boolean;
  children: React.ReactNode;
}

export function Page({ shell, owner, build, shellOrigin, stitch, children }: PageProps) {
  return (
    <>
      <meta name="viewport" content={shell ? shellViewport : viewport} />
      {stitch && <Stitch />}
      {shell ? (
        <>
          {/* The fragments draw nothing here; they report the session and the cart count to the
              native tab bar. Each script comes from the team that owns it. */}
          <script type="module" src="/fragments/account-button.js" async />
          <script type="module" src="/store-static/fragments/mini-cart.js" async />
          <div hidden>
            <rsc-account-button />
            <rsc-mini-cart />
          </div>
        </>
      ) : (
        <>
          <script type="module" src={`${shellOrigin}/shell-static/fragments/header.js`} async />
          <script type="module" src={`${shellOrigin}/shell-static/fragments/footer.js`} async />
          {/* The nav is in the server HTML so crawlers (and users before header.js loads) see the
              site's links: a custom element's light DOM is invisible to them only once JS runs.
              header.js then draws the same links in its shadow root, which hides these. Keep in
              step with `pages` in fragments/header.js. ponytail: no aria-current server-side,
              header.js sets it; a shared list would need a served module. */}
          <rsc-header data-owner="shell">
            <nav className="flex min-h-[49px] items-center gap-1 border-b border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
              {pages.map(([to, label]) => (
                <a key={to} href={to} className="rounded-md px-3 py-1.5 text-neutral-600 dark:text-neutral-400">
                  {label}
                </a>
              ))}
            </nav>
          </rsc-header>
        </>
      )}
      <main data-owner={owner} data-build={build} className="mx-auto max-w-3xl space-y-4 p-6">
        {children}
      </main>
      {!shell && <rsc-footer data-owner="shell" />}
    </>
  );
}
