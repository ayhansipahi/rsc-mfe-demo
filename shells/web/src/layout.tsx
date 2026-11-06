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
          <rsc-header data-owner="shell" />
        </>
      )}
      <main data-owner={owner} data-build={build} className="mx-auto max-w-3xl space-y-4 p-6">
        {children}
      </main>
      {!shell && <rsc-footer data-owner="shell" />}
    </>
  );
}
