# Team-owned verticals (shells → apps → services) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into `shells/`, `apps/`, `services/` so each team's web app, service and infra are separate packages that build, run and deploy on their own, with the web shell stitching header/main/footer at runtime.

**Architecture:** One npm workspace at the repo root. `shells/web` (`@rsc-mfe/shell`) owns the page skeleton, the session contract and the header/footer fragments, served by a tiny express function. Each app (`apps/account|orders|store`) is a React Router RSC build with its own routes, base path, `index.js` and `infra/`. Each service (`services/orders|cart`) is an express Lambda Web Function with bearer-token auth over its own DynamoDB table. Apps call services over HTTP; nothing else crosses package lines.

**Tech Stack:** Node 26 (runs `.ts` directly, `node --test`), npm 11 workspaces, React Router 8.5 RSC + Vite 8 + `@vitejs/plugin-rsc`, Tailwind 4, express 5, `aws-jwt-verify`, DynamoDB document client, AWS Lambda Web Functions (`aws lambda-web deploy`), CloudFront.

**Spec:** `docs/superpowers/specs/2026-11-06-vertical-modules-design.md`

## Global Constraints

- Allowed cross-package imports: apps → `@rsc-mfe/shell` only. Services import nothing from the repo. Apps never import `@aws-sdk/client-dynamodb` or `lib-dynamodb`.
- Auth code (Cognito client, passkeys, login/signup/logout pages) only in `apps/account`.
- Every function sets `x-vertical: <package name>` (`shell-web`, `account-web`, `orders-web`, `store-web`, `orders-api`, `cart-api`).
- `DEV_SESSION` is honoured only when `process.env.NODE_ENV !== "production"`.
- Function names: `rsc-mfe-web` (account), `rsc-mfe-orders-web`, `rsc-mfe-store-web`, `rsc-mfe-shell-web`, `rsc-mfe-orders-api`, `rsc-mfe-cart-api`. Tables: `rsc-mfe-orders`, `rsc-mfe-carts` (unchanged).
- App bases: account `/`, orders `/orders-static/`, store `/store-static/`. Fragment URLs: `/fragments/account-button.js`, `/store-static/fragments/mini-cart.js`, `/shell-static/fragments/header.js`, `/shell-static/fragments/footer.js`.
- Fragment files contain the literal `__BUILD__`; `npm run build` in the owning package writes stamped copies to `build/fragments/`; `index.js` serves `build/fragments/`, `Cache-Control: public, max-age=60`.
- `shells/mobile` is **not** in the root workspaces (own lockfile, Expo).
- No new runtime dependencies beyond what `web/package.json` has today. Tests use `node:test` only.
- Commit after every task; no attribution lines in commit messages.

## Review Focus

1. A request to `apps/orders` whose service is down or `ORDERS_API_URL` unset must render an error, not hang: `fetch` wrapped so a network failure throws a `Response` 502 that the error boundary shows. (Task 5 test: `listOrders` with an unreachable URL rejects.)
2. A service that receives a well-formed JWT from another Cognito client id must answer 401, not 500. (Task 3 test: `verifyBearer` returns `null` for a garbage token; verifier errors are caught.)
3. `DEV_SESSION` set in a production build must be ignored on both app and service. (Task 2 and Task 3 tests with `NODE_ENV=production`.)
4. The cart service must reject ids that are not `/^[\w-]{1,32}$/` with 400 before touching DynamoDB. (Task 4 test.)
5. The store app must never send an unknown product id to the service: `isProduct` check stays in `/store/api/cart` and `store.cart.tsx`. (Task 6 test on the route action.)

---

### Task 1: Workspace root, mobile move, CODEOWNERS

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `CODEOWNERS`
- Move: `web/scripts/patch-react-router.mjs` → `scripts/patch-react-router.mjs`; `mobile/` → `shells/mobile/`
- Modify: `.gitignore`

**Interfaces:**
- Produces: root `package.json` with `"workspaces": ["shells/web", "apps/*", "services/orders", "services/cart"]`, `"scripts": { "postinstall": "node scripts/patch-react-router.mjs" }`, `"private": true`, `"type": "module"`. `tsconfig.base.json` = today's `web/tsconfig.json` `compilerOptions` minus `paths`/`rootDirs`/`include`.
- Patch script resolves `react-router` from the repo root: `node_modules/react-router/...` (hoisted). Keep its "already present" no-op.

- [ ] **Step 1: `git mv mobile shells/mobile`, `git mv web/scripts/patch-react-router.mjs scripts/`.**
- [ ] **Step 2: Write root `package.json` and `tsconfig.base.json` as above. `.gitignore`: replace `/web/build/`, `/web/.react-router/` and `node_modules/` with `build/`, `.react-router/`, `node_modules/` (no leading slash: per-package installs from `deploy.sh` must stay ignored).**
- [ ] **Step 3: Write `CODEOWNERS`** with exactly the spec's eight lines.
- [ ] **Step 4: Verify the patch script tolerates a missing install.** Run: `node scripts/patch-react-router.mjs`. Expected: throws ENOENT (no node_modules yet). Change it to `console.log("patch-react-router: react-router not installed, skipping")` and exit 0 when the file is missing, so `npm install` of a partial tree works. Rerun; expected: the skip line.
- [ ] **Step 5: Commit** `chore: workspace root, mobile under shells/, CODEOWNERS`.

---

### Task 2: `shells/web` — `@rsc-mfe/shell`

**Files:**
- Create: `shells/web/package.json`, `shells/web/tsconfig.json`, `shells/web/src/session.server.ts` (from `web/app/session.server.ts`), `src/styles.ts`, `src/shell-bridge.ts`, `src/app.css`, `src/custom-elements.d.ts` (from `web/app/…`; `git mv`), `src/layout.tsx`, `src/build.d.ts`, `fragments/header.js`, `fragments/footer.js`, `index.js`, `scripts/stamp-fragments.mjs` (at repo root `scripts/`, shared by all fragment owners), `infra/deploy.sh`, `infra/cloudfront.sh`, `infra/cloudfront-vertical.sh`, `infra/cloudfront-domain.sh`, `infra/cloudfront/*.json` (git mv from `infra/`)
- Test: `shells/web/src/session.server.test.ts`, `scripts/stamp-fragments.test.mjs`

**Interfaces:**
- Produces `package.json` `"name": "@rsc-mfe/shell"`, `"exports": { "./session.server": "./src/session.server.ts", "./layout": "./src/layout.tsx", "./styles": "./src/styles.ts", "./shell-bridge": "./src/shell-bridge.ts", "./app.css": "./src/app.css" }`, deps: `aws-jwt-verify`, `express`; peerDeps `react`, `react-router`; scripts `"build": "node ../../scripts/stamp-fragments.mjs"`, `"dev": "npm run build && PORT=4000 node index.js"`, `"test": "node --test src"`.
- `getUser(request: Request): Promise<SessionUser | null>` unchanged, plus: if `process.env.NODE_ENV !== "production" && process.env.DEV_SESSION` → `{ sub: "dev", username: process.env.DEV_SESSION, token: "dev" }`.
- `Document({ children })`: today's `Layout` body from `root.tsx` (html/head/meta/Links/body/.root). `Page({ shell, owner, build, shellOrigin, stitch, children }: { shell: boolean; owner: string; build: string; shellOrigin: string; stitch: boolean; children: React.ReactNode })`: renders the viewport meta (shell variant as today), and either (shell) `<div hidden><rsc-mini-cart/><rsc-account-button/></div>` + both fragment scripts from their owners' paths, or (web) `<rsc-header data-owner="shell"/>`, `<main data-owner={owner} data-build={build} className="mx-auto max-w-3xl space-y-4 p-6">{children}</main>`, `<rsc-footer data-owner="shell"/>` and the two async module scripts `${shellOrigin}/shell-static/fragments/{header,footer}.js`. When `stitch` is true, `Page` renders an inline `<script>document.documentElement.classList.add("stitch")</script>` (`Document` cannot see loader data). `custom-elements.d.ts` gains `rsc-header`, `rsc-footer`; apps pick it up through their tsconfig `include` (Task 5), so it is not in the exports map.
- `build.d.ts`: `declare const __BUILD__: string;` (apps define it via Vite).
- `scripts/stamp-fragments.mjs`: reads `fragments/*.js` of `process.cwd()`, replaces every `__BUILD__` with `new Date().toISOString().slice(0, 16) + "Z"`, writes to `build/fragments/`. Exported function `stamp(srcDir, outDir, stampValue)` for the test; runs `stamp("fragments", "build/fragments", now)` when invoked as main.
- `fragments/header.js`: defines `rsc-header`; shadow root with `<nav>` (links Home `/`, Store `/store`, Orders `/orders`, styles ported from `nav.tsx` classes to plain CSS, active link by `location.pathname`), then `<rsc-mini-cart>` and `<rsc-account-button>`; appends `<script type="module">` tags for `/store-static/fragments/mini-cart.js` and `/fragments/account-button.js` to `document.head` once. Host gets `data-build="__BUILD__"`. `:host { display:block; min-height: 49px }` (32px box + 2×8px padding + 1px border, matching today's nav).
- `fragments/footer.js`: defines `rsc-footer`; text `Shell · built __BUILD__`, `data-build="__BUILD__"`.
- `index.js`: express; `x-vertical: shell-web`; `app.use("/shell-static/fragments", express.static("build/fragments", { setHeaders: (res) => { res.setHeader("Cache-Control", "public, max-age=60"); res.setHeader("Access-Control-Allow-Origin", "*"); } }))`; listens on `AWS_LAMBDA_HTTP_ENDPOINT` or `0.0.0.0:${PORT ?? 3000}` as today's `index.js` does.
- `infra/deploy.sh`: `npm ci` at repo root; `npm run build -w shells/web`; in `shells/web`: `npm install --omit=dev --workspaces=false --install-links --no-fund --no-audit`; `aws lambda-web deploy --name rsc-mfe-shell-web --code . --execution-role-arn <rsc-mfe-shell-web-role> ${CREATE:+--create --auth-type ApplicationManaged}`. Role: logs only (reuse the create-role part of `web-role.sh` as `infra/role.sh` taking `NAME`).

- [ ] **Step 1: `git mv` the listed files into `shells/web/src`, `shells/web/infra`, `scripts/`.**
- [ ] **Step 2: Write failing test `shells/web/src/session.server.test.ts`:**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getUser } from "./session.server.ts";

test("DEV_SESSION stubs the user outside production", async () => {
  process.env.NODE_ENV = "development"; process.env.DEV_SESSION = "me@example.com";
  assert.deepEqual(await getUser(new Request("http://x/")), { sub: "dev", username: "me@example.com", token: "dev" });
});
test("DEV_SESSION is ignored in production", async () => {
  process.env.NODE_ENV = "production"; process.env.DEV_SESSION = "me@example.com";
  assert.equal(await getUser(new Request("http://x/")), null);
});
```

- [ ] **Step 3: Run `node --test shells/web/src` → fails (first test gets `null`).**
- [ ] **Step 4: Add the stub to `getUser`; rerun → pass.**
- [ ] **Step 5: Write failing test `scripts/stamp-fragments.test.mjs`:** `stamp` on a temp dir with `a.js` containing `x="__BUILD__";y="__BUILD__"` and stamp value `2026-11-06T10:00Z` produces `build/fragments/a.js` with both replaced; run → fails (module missing).
- [ ] **Step 6: Implement `scripts/stamp-fragments.mjs`; rerun → pass.**
- [ ] **Step 7: Write `layout.tsx`, `build.d.ts`, `custom-elements.d.ts` additions, `header.js`, `footer.js`, `index.js`, `package.json`, `tsconfig.json` (`extends ../../tsconfig.base.json`, `include: ["src/**/*"]`).**
- [ ] **Step 8: Verify the shell serves stamped fragments.** Run from repo root: `npm install`, then `npm run dev -w shells/web &` and `curl -si localhost:4000/shell-static/fragments/footer.js | grep -E "x-vertical|Cache-Control|Access-Control|built"`. Expected: all four lines, `built 2026-…` with no `__BUILD__` left.
- [ ] **Step 9: Spike the isolated install:** in `shells/web` run `npm install --omit=dev --workspaces=false --install-links --no-fund --no-audit`; `ls node_modules/express node_modules/aws-jwt-verify` exist and `node -e "import('./index.js')"` loads. Record the exact flags that worked in `infra/deploy.sh`. Then `rm -rf shells/web/node_modules` and `npm install` at root again.
- [ ] **Step 10: Write `infra/deploy.sh`, `infra/role.sh`; `chmod +x`.**
- [ ] **Step 11: Commit** `feat(shell): @rsc-mfe/shell package with header/footer fragments and session contract`.

---

### Task 3: `services/orders`

**Files:**
- Create: `services/orders/package.json`, `app.js`, `auth.js`, `orders.js` (from `web/app/orders.server.ts`, as JS), `index.js`, `infra/table.sh` (git mv `infra/orders-table.sh`), `infra/role.sh`, `infra/deploy.sh`
- Test: `services/orders/app.test.js`, `services/orders/auth.test.js`

**Interfaces:**
- `package.json` name `@rsc-mfe/orders-api`, deps `express`, `aws-jwt-verify`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`; scripts `"dev": "PORT=4001 node index.js"`, `"test": "node --test"`.
- `auth.js`: `export async function verifyBearer(req): Promise<{ sub: string } | null>` — reads `Authorization: Bearer <t>`; if `NODE_ENV !== "production" && DEV_SESSION && t === "dev"` → `{ sub: "dev" }`; else `CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "access" }).verify(t)` → `{ sub }`, any throw → `null`. Verifier created lazily once.
- `orders.js`: `export async function listOrders(sub): Promise<Order[]>` (today's query).
- `app.js`: `export function createApp({ listOrders }): express.Application` — sets `x-vertical: orders-api`; `GET /orders` → 401 `{ error: "unauthorized" }` without a valid bearer, else 200 `Order[]` with `Cache-Control: private, no-store`.
- `index.js`: `createApp({ listOrders }).listen` on `AWS_LAMBDA_HTTP_ENDPOINT` or `0.0.0.0:${PORT ?? 3000}`.
- `infra/deploy.sh`: like Task 2's with `--name rsc-mfe-orders-api`, `--env ORDERS_TABLE=rsc-mfe-orders --env COGNITO_USER_POOL_ID --env COGNITO_CLIENT_ID`. `infra/role.sh`: role `rsc-mfe-orders-api-role` with the `query-orders` policy from `web-role.sh`.

- [ ] **Step 1: Write failing `app.test.js`:** start `createApp({ listOrders: async (sub) => [{ orderId: "O1", item: "Kbd", total: "1.00", sub }] })` on port 0; `fetch("/orders")` → 401; with `NODE_ENV=development DEV_SESSION=x` and header `Authorization: Bearer dev` → 200, body `[{orderId:"O1",…, sub:"dev"}]`, header `x-vertical: orders-api`.
- [ ] **Step 2: Write failing `auth.test.js`:** `Bearer dev` with `NODE_ENV=production` → `null`; `Bearer not-a-jwt` with pool env set to `eu-north-1_x` / `abc` → `null` (no throw).
- [ ] **Step 3: Run `node --test services/orders` → fails (modules missing).**
- [ ] **Step 4: Implement `auth.js`, `orders.js`, `app.js`, `index.js`, `package.json`; `npm install` at root; rerun → pass.**
- [ ] **Step 5: `git mv infra/orders-table.sh services/orders/infra/table.sh`; write `role.sh`, `deploy.sh`.**
- [ ] **Step 6: Commit** `feat(orders-api): orders service with bearer auth`.

---

### Task 4: `services/cart`

**Files:**
- Create: `services/cart/package.json`, `app.js`, `auth.js` (copy of Task 3's, services share nothing), `cart.js` (cart functions from `web/app/store.server.ts`, without the catalog join), `index.js`, `infra/table.sh` (git mv `infra/carts-table.sh`), `infra/role.sh`, `infra/deploy.sh`
- Test: `services/cart/app.test.js`

**Interfaces:**
- Name `@rsc-mfe/cart-api`; dev port 4002; `x-vertical: cart-api`.
- `cart.js`: `getLines(sub): Promise<{ productId: string; qty: number }[]>` (items with `qty > 0`), `addLine(sub, productId)`, `removeLine(sub, productId)`.
- `createApp({ getLines, addLine, removeLine })`: all routes 401 without bearer. `GET /cart` → `{ lines }`. `PUT /cart/:productId` → 204. `DELETE /cart/:productId` → 204. `productId` not matching `/^[\w-]{1,32}$/` → 400 `{ error: "bad product id" }` before calling the store functions.
- Deploy name `rsc-mfe-cart-api`, env `CARTS_TABLE=rsc-mfe-carts` + Cognito ids; role policy `cart-access` from `web-role.sh`.

- [ ] **Step 1: Write failing `app.test.js`:** in-memory fakes; 401 unauth; `PUT /cart/kbd` → 204 and `GET /cart` → `{ lines: [{ productId: "kbd", qty: 1 }] }`; `DELETE /cart/kbd` → 204 and lines empty; `PUT /cart/` + 40 chars → 400 and `addLine` not called.
- [ ] **Step 2: Run → fails. Implement; rerun → pass.**
- [ ] **Step 3: Move table script, write `role.sh`, `deploy.sh`. Commit** `feat(cart-api): cart service`.

---

### Task 5: `apps/orders`

**Files:**
- Create: `apps/orders/package.json`, `tsconfig.json`, `vite.config.ts`, `react-router.config.ts`, `index.js`, `app/root.tsx`, `app/routes.ts`, `app/app.css`, `app/orders.server.ts`, `app/routes/orders.tsx` (git mv `web/app/routes/orders.tsx`), `infra/deploy.sh`, `infra/role.sh`
- Test: `apps/orders/app/orders.server.test.ts`

**Interfaces:**
- `tsconfig.json`: `extends ../../tsconfig.base.json`, `include: ["app/**/*", ".react-router/types/**/*", "../../shells/web/src/*.d.ts"]`, `rootDirs: [".", "./.react-router/types"]`.
- `package.json` name `@rsc-mfe/orders-web`; deps: `@rsc-mfe/shell` (`"*"`), `react`, `react-dom`, `react-router`, `express`, `compression`, `@remix-run/node-fetch-server`; devDeps as today's `web/package.json` (RR dev, vite, rsc plugin, tailwind, typescript, types); scripts `build`, `dev`, `start`, `typecheck`, `test` as today plus `"test": "node --test app"`.
- `vite.config.ts`: today's with `base: "/orders-static/"`, `define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16) + "Z") }`, `ssr: { noExternal: ["@rsc-mfe/shell"] }`.
- `app/app.css`: `@import "@rsc-mfe/shell/app.css"; @source "../../../shells/web/src";`.
- `app/root.tsx`: `loader` returns `{ shell: ua.includes("RSCShell/"), stitch: url.searchParams.has("stitch"), shellOrigin: process.env.SHELL_ORIGIN ?? "" }`; `shouldRevalidate` as today; `export const Layout = Document` re-export pattern: `export function Layout({ children }) { return <Document>{children}</Document>; }`; `App` renders `<Page shell owner="orders" build={__BUILD__} shellOrigin stitch><Outlet /></Page>`; `ErrorBoundary` as today.
- `app/routes.ts`: `[route("orders", "routes/orders.tsx")]`.
- `app/orders.server.ts`: `export async function listOrders(user: { token: string }): Promise<Order[]>` — `fetch(\`${process.env.ORDERS_API_URL}/orders\`, { headers: { authorization: \`Bearer ${user.token}\` } })`; non-OK or network error → `throw new Response("orders service unavailable", { status: 502 })`.
- `routes/orders.tsx`: imports `getUser` from `@rsc-mfe/shell/session.server`; outer `<main>` becomes `<div>` (the shell's `Page` owns `<main>`).
- `index.js`: today's minus `.well-known` routes, `x-vertical: orders-web`, base `/orders-static`, fragments mount removed (orders has none).
- `infra/deploy.sh`: name `rsc-mfe-orders-web`, env `ORDERS_API_URL`, `COGNITO_*`, `PUBLIC_HOST`, `SHELL_ORIGIN` unset; echoes `shells/web/infra/cloudfront-vertical.sh <dist> orders <host>` as the one-time step. `role.sh`: logs only.

- [ ] **Step 1: Write failing `orders.server.test.ts`:** `ORDERS_API_URL=http://127.0.0.1:1` → `listOrders({ token: "t" })` rejects with a `Response` whose `status === 502`; with a local `http.createServer` returning `[{"orderId":"O1"}]` and asserting the `authorization` header equals `Bearer t` → resolves to that array.
- [ ] **Step 2: Run `node --test apps/orders/app` → fails. Implement `orders.server.ts`; rerun → pass.**
- [ ] **Step 3: Write the remaining files; `npm install` at root.**
- [ ] **Step 4: Verify build and typecheck.** Run: `npm run typecheck -w apps/orders && npm run build -w apps/orders`. Expected: exit 0, `apps/orders/build/server/index.js` exists.
- [ ] **Step 5: Verify standalone.** Start `npm run dev -w services/orders` (needs AWS creds; if unavailable, start `node -e` fake on 4001 returning `[]`) and `ORDERS_API_URL=http://localhost:4001 DEV_SESSION=me@example.com npm run dev -w apps/orders`; `curl -s localhost:5173/orders | grep -o 'data-owner="[a-z]*"'`. Expected: `shell`, `orders`, `shell` in that order, and `Orders for me@example.com`.
- [ ] **Step 6: Commit** `feat(orders-web): orders app on the shell layout, calling orders-api`.

---

### Task 6: `apps/store`

**Files:**
- Create: `apps/store/package.json`, `tsconfig.json`, `vite.config.ts` (base `/store-static/`), `react-router.config.ts`, `index.js`, `app/root.tsx`, `app/routes.ts`, `app/app.css`, `app/catalog.ts` (catalog + `isProduct` from `store.server.ts`), `app/cart.server.ts`, git mv: `app/routes/store.tsx`, `store.cart.tsx`, `store.api.cart.ts`, `store.api.photo-search.ts`, `app/add-to-cart.tsx`, `cart-changed.tsx`, `photo-search.tsx`, `fragments/mini-cart.js` (from `web/fragments/store/`), `infra/deploy.sh`, `infra/role.sh`
- Test: `apps/store/app/cart.server.test.ts`

**Interfaces:**
- Name `@rsc-mfe/store-web`; extra dep `@aws-sdk/client-bedrock-runtime`; `x-vertical: store-web`; scripts `build` = `react-router build && node ../../scripts/stamp-fragments.mjs`.
- `cart.server.ts`: `getCart(user: { token: string }): Promise<CartLine[]>` → `GET ${CART_API_URL}/cart`, joins `catalog` (drops unknown ids), `addLine(user, productId)` → PUT, `removeLine(user, productId)` → DELETE; non-OK → `throw new Response("cart service unavailable", { status: 502 })`. `countOf` moves here. `CartLine` unchanged.
- `routes/store.api.cart.ts`: unchanged contract; keeps `isProduct` check; calls `cart.server.ts`. `store.cart.tsx` action: `isProduct` check before `removeLine` (new, Review Focus 5).
- `root.tsx`: like orders with `owner="store"`, plus `<PhotoSearch />` inside `Page` when `shell`.
- `index.js`: base `/store-static`, serves `build/fragments` at `/store-static/fragments`.
- `mini-cart.js`: host `data-owner="store" data-build="__BUILD__"`.
- `infra/deploy.sh`: name `rsc-mfe-store-web`, env `CART_API_URL`, Cognito ids, `PUBLIC_HOST`; `role.sh`: Bedrock policy only (`photo-search-model` from `web-role.sh`).

- [ ] **Step 1: Write failing `cart.server.test.ts`:** fake server returns `{ lines: [{ productId: "kbd", qty: 2 }, { productId: "zzz", qty: 1 }] }` → `getCart` resolves `[{ productId: "kbd", name: "Mechanical keyboard", price: 89, qty: 2 }]`; `addLine` sends `PUT /cart/kbd` with bearer.
- [ ] **Step 2: Run → fails. Implement; rerun → pass.**
- [ ] **Step 3: Move/write remaining files; `npm run typecheck -w apps/store && npm run build -w apps/store` → exit 0 and `build/fragments/mini-cart.js` has no `__BUILD__`.**
- [ ] **Step 4: Commit** `feat(store-web): store app on the shell layout, calling cart-api`.

---

### Task 7: `apps/account`

**Files:**
- Create: `apps/account/package.json`, `tsconfig.json`, `vite.config.ts` (base `/`), `react-router.config.ts`, `index.js` (keeps `.well-known` routes), `app/root.tsx`, `app/routes.ts`, `app/app.css`; git mv from `web/app`: `cognito.server.ts`, `login-form.tsx`, `register-passkey.tsx`, `passkey-support.ts`, `routes/home.tsx`, `login.tsx`, `signup.tsx`, `logout.ts`, `account.tsx`, `auth.passkey.ts`, `auth.me.ts`; `fragments/account-button.js` (from `web/fragments/account/`); `infra/deploy.sh`, `infra/role.sh`; `services/auth/infra/cognito.sh`, `cognito-rp.sh` (git mv from `infra/`)
- Delete: `web/` entirely, `infra/` entirely (whatever remains), `web/app/nav.tsx`, `web/app/root.tsx`, `web/app/routes.ts`, `web/app/store.server.ts`, `web/app/session.server.ts` leftovers.

**Interfaces:**
- Name `@rsc-mfe/account-web`; deps add `@aws-sdk/client-cognito-identity-provider`, `@simplewebauthn/browser`; `x-vertical: account-web`; serves `build/fragments` at `/fragments`.
- Session imports change to `@rsc-mfe/shell/session.server` (`getUser`, `signInCookies`, `clearedCookie`, `readLastEmail`); style imports to `@rsc-mfe/shell/styles`.
- `home.tsx` copy: replace the second paragraph with one sentence per layer: "Header and footer come from the shell team, this page from the account team, the cart badge from the store team: four deployables, one page. Add ?stitch to the URL to see them."
- `account-button.js`: host `data-owner="account" data-build="__BUILD__"`.
- `infra/deploy.sh`: name `rsc-mfe-web`, env Cognito ids + secret, `PUBLIC_HOST`, `APPLE_APP_IDS`, `ANDROID_*`; `role.sh`: `cognito-admin-auth`.

- [ ] **Step 1: Move/write files; `git rm -r web infra` once empty.**
- [ ] **Step 2: Verify every app and the shell build.** Run: `for p in shells/web apps/account apps/orders apps/store; do npm run build -w $p || exit 1; done; npm run typecheck -w apps/account -w apps/orders -w apps/store`. Expected: exit 0.
- [ ] **Step 3: Verify no cross-package imports.** Run: `grep -rn "from \"\.\./\.\./" apps services shells/web/src --include=*.ts --include=*.tsx --include=*.js | grep -v node_modules`. Expected: no output. Run: `grep -rln "lib-dynamodb" apps`. Expected: no output.
- [ ] **Step 4: Commit** `feat(account-web): account app; remove web/ and infra/`.

---

### Task 8: Demo overlay

**Files:**
- Modify: `shells/web/src/app.css`, `shells/web/fragments/header.js`, `footer.js`, `apps/store/fragments/mini-cart.js`, `apps/account/fragments/account-button.js`
- Test: none (browser-only CSS and shadow DOM); verified by Step 2's screenshot.

**Interfaces:**
- `app.css`: `html.stitch [data-owner] { outline: 2px dashed; outline-offset: -2px; position: relative } html.stitch [data-owner]::before { content: attr(data-owner) " · " attr(data-build); position: absolute; top: 0; right: 0; font: 11px/1 ui-monospace, monospace; padding: 2px 6px; background: #000; color: #fff }`. Owner colours via `outline-color`: shell `#2563eb`, orders `#16a34a`, store `#d97706`, account `#dc2626`.
- Each fragment: a 6-line snippet `applyStitch(host, shadowRoot, owner, build)` (duplicated per file, fragments share nothing) that, when `document.documentElement.classList.contains("stitch")`, injects the same outline + label style into the shadow root.

- [ ] **Step 1: Write the CSS and the fragment snippets.**
- [ ] **Step 2: Verify in a browser.** Run the standalone orders setup from Task 5 Step 5 plus `npm run dev -w shells/web`, open `http://localhost:5173/orders?stitch` with `SHELL_ORIGIN=http://localhost:4000` on the app. Expected: header, main, footer outlined with labels `shell · <build>`, `orders · <build>`; inside the header, the mini cart and account button are empty (their APIs are not running) but the host elements carry `data-owner`. Screenshot to `docs/superpowers/plans/stitch-overlay.png` for the review.
- [ ] **Step 3: Commit** `feat: ?stitch overlay showing each area's owner and build time`.

---

### Task 9: Deploy run-through and README

**Files:**
- Create: `README.md` (repo root): the three layers, the per-team commands (`npm run dev -w …`, `infra/deploy.sh`), the deploy order (services → shell → apps), the env each function needs.
- Modify: nothing else.

- [ ] **Step 1: Dry-run every deploy script's build half.** Run each `infra/deploy.sh` with `DRY=1` (add: `[ -n "${DRY:-}" ] && exit 0` right before `aws lambda-web deploy`) so `npm ci`, build, and the isolated install run for all six packages. Expected: each package ends with its own `node_modules/express` and `@rsc-mfe/shell` as a real directory (apps), exit 0.
- [ ] **Step 2: Write `README.md`.**
- [ ] **Step 3: `git status` shows no `node_modules` or `build` paths (Task 1's `.gitignore`). Commit** `docs: README for the three-layer layout`.
