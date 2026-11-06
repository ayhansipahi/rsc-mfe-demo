# Team-owned verticals: shells → apps → services

## Intent

The demo must show, in the repo and on the page, that each page vertical is owned by one team,
lives in its own modules across every layer (web app, service, infra), deploys on its own
schedule, and runs on its own. Today the three verticals (account, orders, store) share
`web/app/` and are split only at build time by `VERTICAL`; the header is compiled into every
build; data access runs inside the web function; all infra scripts sit in one root folder.

## Goals

- Ownership readable from the tree, by team, not by channel: a team's web app, its service and
  the infra of both carry the team's name, and `CODEOWNERS` maps them to the team.
- Three deploy layers, each independent: **shells** (web shell, mobile shell), **apps** (one
  per team: pages and fragments), **services** (one per team: internal HTTP API).
- Standalone run: the orders team clones the repo, installs once, starts `apps/orders` and
  `services/orders` with nothing else running, and gets a working orders page.
- Explicit shell areas on the web: **header** (shell), **main** (the app that owns the path),
  **footer** (shell). Header and footer come from the shell at runtime, not at build.
- Stitching visible: a demo overlay outlines each area with its owner's name and build time.

## Non-goals

- Separate git repositories. One repo, npm workspaces, `CODEOWNERS`. The layout moves to separate
  repos later without a redesign.
- A local reverse proxy serving all apps on one port. Locally each team runs its own app and
  service; the integrated page is verified on CloudFront.
- Session refresh, cache keys per client, any behaviour change in the mobile shell, an auth
  service (Cognito is the auth service), a catalog service (the catalog stays a constant in the
  store app).

## Anti-goals

- An app importing another app, or a service importing anything outside itself. The only
  allowed cross-package import is `@rsc-mfe/shell` from apps.
- Auth code (Cognito client, passkeys, login/signup pages) anywhere but `apps/account`.
- DynamoDB access from an app. Apps call their team's service over HTTP.
- A vertical that only works when the whole site is up.

## Layout

```
shells/
  web/                  platform team. Package @rsc-mfe/shell.
    src/session.server.ts   getUser(request): today's session.server.ts + DEV_SESSION stub
    src/layout.tsx          Page: <rsc-header>, {children}, <rsc-footer>, mobile-shell branch
    src/styles.ts, src/shell-bridge.ts, src/app.css, src/custom-elements.d.ts
    fragments/header.js     <rsc-header>: nav, with <rsc-mini-cart> and <rsc-account-button> inside
    fragments/footer.js     <rsc-footer>: footer text + shell build time
    index.js                express: fragments/ at /shell-static/fragments, CORS, max-age=60
    infra/                  cloudfront.sh, cloudfront-domain.sh, cloudfront/*.json, shell function deploy,
                            cloudfront-vertical.sh (the contract apps use to add their behaviours)
  mobile/                 platform team. Today's mobile/ moved as is (own lockfile, not a workspace).
apps/
  account/                account team. /, /login, /signup, /logout, /account, /auth/*, account-button.js
    infra/                deploy.sh (function rsc-mfe-web), role.sh (Cognito admin grant)
  orders/                 orders team. /orders
    infra/                deploy.sh (rsc-mfe-orders-web), role.sh (logs only), cloudfront behaviour
  store/                  store team. /store, /store/cart, /store/api/cart, /store/api/photo-search, mini-cart.js
    infra/                deploy.sh (rsc-mfe-store-web), role.sh (Bedrock grant), cloudfront behaviour
services/
  orders/                 orders team. GET /orders. Owns the orders table.
    infra/                table.sh (today's orders-table.sh), role.sh (Query), deploy.sh (rsc-mfe-orders-api)
  cart/                   store team. GET /cart, PUT /cart/:productId, DELETE /cart/:productId. Owns carts.
    infra/                table.sh (carts-table.sh), role.sh (Query/Update/Delete), deploy.sh (rsc-mfe-cart-api)
  auth/                   account team. No code: Cognito is the service. infra/ = cognito.sh, cognito-rp.sh.
package.json              npm workspaces: shells/web, apps/*, services/orders, services/cart.
                          postinstall runs the React Router patch (scripts/patch-react-router.mjs).
CODEOWNERS
docs/
```

`web/` and `infra/` disappear. Each app package has today's `web/` shape: `app/root.tsx`,
`app/routes.ts` (only its own routes; no combined build), `app/routes/`, `fragments/`,
`index.js` (plain JS, copied per app, with the `.well-known` passkey routes only in account),
`vite.config.ts` (base hardcoded: `/`, `/orders-static/`, `/store-static/`),
`react-router.config.ts`, `tsconfig.json` (extends a root `tsconfig.base.json`), `package.json`.

Where today's files go:

| today | goes to |
|---|---|
| app/session.server.ts, styles.ts, shell-bridge.ts, app.css, custom-elements.d.ts, nav.tsx (→ fragments/header.js) | shells/web |
| app/cognito.server.ts, login-form.tsx, register-passkey.tsx, passkey-support.ts, routes home/login/signup/logout/account/auth.*, fragments/account | apps/account |
| app/routes/orders.tsx | apps/orders |
| app/orders.server.ts (becomes the service's handler) | services/orders |
| app/routes/store.*, add-to-cart.tsx, cart-changed.tsx, photo-search.tsx, fragments/store, the catalog constant from store.server.ts | apps/store |
| store.server.ts cart functions | services/cart |
| infra/cloudfront*.sh, cloudfront/, deploy-web.sh (as shells/web/infra/deploy.sh + per-app deploy.sh) | shells/web/infra and apps/*/infra |
| infra/web-role.sh | split per function: each app's and service's infra/role.sh grants only what it needs |
| infra/orders-table.sh, carts-table.sh | services/orders/infra, services/cart/infra |
| infra/cognito.sh, cognito-rp.sh | services/auth/infra |
| mobile/ | shells/mobile |

## How the page is stitched

An app's `root.tsx` renders `<Page shell={isNativeShell} owner="orders">` from `@rsc-mfe/shell`.
On the web, `Page` renders:

```html
<rsc-header data-owner="shell"></rsc-header>
<main data-owner="orders" data-build="2026-11-06T10:21Z">…the app's outlet…</main>
<rsc-footer data-owner="shell"></rsc-footer>
```

plus two async module scripts, `${SHELL_ORIGIN}/shell-static/fragments/header.js` and
`.../footer.js`. `SHELL_ORIGIN` is a server env read in the app's root loader: empty in production
(same CloudFront host), the shell's dev server URL when running standalone with the shell
alongside, unset when running fully alone. Unset, the scripts 404, the tags stay empty, the page
still works: that is standalone mode.

`header.js` draws the nav (Home, Store, Orders) in a shadow root and places `<rsc-mini-cart>` and
`<rsc-account-button>` inside it, loading their scripts from the owners' paths
(`/store-static/fragments/mini-cart.js`, `/fragments/account-button.js`) exactly as `root.tsx`
does today. Apps no longer know those fragments exist. Cross-app links are plain `<a>` (full
document loads). `<rsc-header>` keeps a min-height so the page does not jump when it fills.

Inside the native mobile shell (`RSCShell/` User-Agent) `Page` renders what `root.tsx` renders
today: hidden `<rsc-mini-cart>` and `<rsc-account-button>`, no header/footer. The store's
`<PhotoSearch>` moves into the store app's `root.tsx`. The mobile app does not change.

## Session contract (platform contract + local stub)

`@rsc-mfe/shell` exports `getUser(request)`: today's `session.server.ts`. Apps call it and carry
no other auth code. Every app function gets `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` (to
verify the cookie); the client secret, admin grants and passkey config stay on account only.

Standalone stub: when `NODE_ENV !== "production"` and `DEV_SESSION` is set, `getUser` returns
`{ sub: "dev", username: DEV_SESSION, token: "dev" }` without reading the cookie. Production builds
never consult it. "Sign in" in standalone mode points at `/login` and 404s; accepted.

## Services

- Each service is a Lambda Web Function running express, deployed with `aws lambda-web deploy`
  like the apps, **not** behind CloudFront. Its endpoint hostname is its address; the owning app
  gets it as `ORDERS_API_URL` / `CART_API_URL`.
- Auth is token propagation: the app sends the user's Cognito access token as
  `Authorization: Bearer <token>`; the service verifies it with `aws-jwt-verify` (same pool and
  client id, `tokenUse: "access"`) and scopes every query to `payload.sub`. No token, invalid
  token → 401. The verify code is ~10 lines per service and is not shared (services import nothing).
- Standalone stub on the service side: with `NODE_ENV !== "production"` and `DEV_SESSION` set,
  the service accepts `Bearer dev` as that user with `sub: "dev"`. So the orders team's
  standalone setup is: `DEV_SESSION=me@example.com` on both the app and the service, AWS
  credentials for DynamoDB on the service only.
- `services/orders`: `GET /orders` → `Order[]` for the caller.
- `services/cart`: `GET /cart` → `{ count, lines }`; `PUT /cart/:productId` adds one;
  `DELETE /cart/:productId` removes the line. The catalog lives in the store app, so the service
  knows no products: it stores `{ owner, productId, qty }`, rejects only an empty or over-long id
  (400), and `GET /cart` returns the raw lines. The store app keeps validating product ids with
  `isProduct` before calling the service, as `store.api.cart.ts` does today, and joins names and
  prices. The store app's `/store/api/cart` resource route stays
  as the browser-facing contract (cookie auth, JSON body), proxies to the service, and joins the
  catalog; the mini-cart fragment and the store pages do not change their calls.
- Every function answers with `x-vertical: <package name>` so the demo can show which deployable
  answered.

## Demo overlay

`?stitch` on any URL sets a class on `<html>` (via `Page`) that outlines every `[data-owner]` box
and prints `data-owner` and `data-build` in a corner, with CSS in `app.css`. `data-build` is the
package's build timestamp (Vite `define`). Fragments take part too: every fragment file
(`header.js`, `footer.js`, `mini-cart.js`, `account-button.js`) gets a build timestamp stamped by
its owner's deploy script, and each custom element sets `data-owner` and `data-build` on its host
and, when the `stitch` class is on `<html>`, draws its own outline and label inside its shadow
root (page CSS cannot reach into a shadow tree, and the mini cart and account button sit inside
the header's). An orders page then shows four owners with four build times: shell (header,
footer), orders (main), store (mini cart), account (account button). That is the demo.

## Deploy

- Per package `infra/deploy.sh`: `npm ci` at the repo root, `npm run build -w <package>`, then
  inside the package `npm install --omit=dev --workspaces=false --install-links` so it gets its
  own real `node_modules` (workspace hoisting leaves the package directory without them;
  `--install-links` copies `@rsc-mfe/shell` instead of symlinking it), then `aws lambda-web deploy`
  that directory. `@rsc-mfe/shell`'s TypeScript is consumed only by the Vite build
  (`ssr.noExternal`), never by `index.js` at runtime, so it needs no compile step.
- `shells/web/infra/cloudfront-vertical.sh <dist> <name> <host>` stays the one contract for adding
  an origin plus `/<name>-static/*` and `/<name>*` behaviours; each app's `infra/deploy.sh`
  prints the command to run once. The shell function is added the same way (`/shell-static/*`;
  the `/shell*` page behaviour it also adds is harmless).
- Tailwind: each app's `app.css` imports the shell's and adds `@source "../../shells/web/src"` so
  shell classes are generated.

## Local development

- Orders team: `npm run dev -w services/orders` (port 4001) and
  `ORDERS_API_URL=http://localhost:4001 DEV_SESSION=me@example.com npm run dev -w apps/orders`.
  `/orders` opens with empty header/footer slots.
- `npm run dev -w shells/web` serves fragments on another port; `SHELL_ORIGIN=http://localhost:<port>`
  on an app fills the slots. Header links to other apps 404 locally; accepted.

## CODEOWNERS

```
/shells/            @rsc-mfe/platform
/apps/account/      @rsc-mfe/account
/services/auth/     @rsc-mfe/account
/apps/orders/       @rsc-mfe/orders
/services/orders/   @rsc-mfe/orders
/apps/store/        @rsc-mfe/store
/services/cart/     @rsc-mfe/store
/package.json       @rsc-mfe/platform
```

Team handles are placeholders; the repo has no GitHub teams yet.

## Left to the builder

- Dev ports, the exact shape of `tsconfig.base.json`, and how `data-build` reaches `Page`.
- Whether the RR patch runs from the root postinstall once (hoisted) or also per package after
  the isolated install in `deploy.sh`. It must run wherever `react-router` ends up installed.
- README updates describing the three layers and the per-team commands.
