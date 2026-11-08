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
const navLink = "rounded-md px-3 py-1.5 text-neutral-600 dark:text-neutral-400";

export interface PageProps {
  /** Inside the native mobile shell (RSCShell/ User-Agent): no web chrome, fragments report to the tab bar. */
  shell: boolean;
  /** The team whose app renders main: "account" | "orders" | "store". */
  owner: string;
  /** The app build stamp (Vite define __BUILD__: the source hash prefix when built by CDK, else the build minute). */
  build: string;
  /** Where header.js and footer.js are fetched from; "" in production (same host). */
  shellOrigin: string;
  /** ?stitch: outline every area with its owner and build stamp. */
  stitch: boolean;
  /** Server HTML for the header's fragments, from chrome(request); omitted, the links are bare. */
  email?: string | null;
  cartCount?: number | null;
  children: React.ReactNode;
}

export function Page({ shell, owner, build, shellOrigin, stitch, email, cartCount, children }: PageProps) {
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
          {/* Every <rsc-*> tag carries server HTML: what a crawler, or a user before the script
              loads, gets instead of the fragment. The fragment's shadow root covers it once JS
              runs (light DOM without a <slot> is not rendered). For the header that is the site
              nav plus what the two nested fragments show, as far as the server knows it (chrome());
              keep in step with `pages` in fragments/header.js. ponytail: no aria-current
              server-side, header.js sets it. */}
          <rsc-header data-owner="shell">
            <nav className="flex min-h-[49px] items-center gap-1 border-b border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
              {pages.map(([to, label]) => (
                <a key={to} href={to} className={navLink}>
                  {label}
                </a>
              ))}
              <span className="ml-auto flex gap-2">
                <a href="/store/cart" className={navLink}>
                  Cart{cartCount != null && <span className="ml-1 font-medium">{cartCount}</span>}
                </a>
                {email ? (
                  <a href="/account" className={navLink}>{email}</a>
                ) : (
                  <a href="/login" className={navLink}>Sign in</a>
                )}
              </span>
            </nav>
          </rsc-header>
        </>
      )}
      <main data-owner={owner} data-build={build} className="mx-auto max-w-3xl space-y-4 p-6">
        {children}
      </main>
      {!shell && (
        <rsc-footer data-owner="shell">
          {/* Same box as fragments/footer.js draws (padding, border, line height), so the page does
              not grow when the script runs: on a page just shorter than the window that growth
              brings in a scrollbar and every centered block shifts sideways. */}
          <footer className="mx-auto max-w-3xl border-t border-neutral-200 p-6 text-xs leading-[1.4] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            RSC micro-frontend demo
          </footer>
        </rsc-footer>
      )}
    </>
  );
}
