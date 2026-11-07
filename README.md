# rsc-mfe-demo

A micro-frontend demo: one site, three teams, every team owns its page vertical end to end and
ships it on its own schedule. React Server Components on Lambda Web Functions behind CloudFront;
the same pages inside a native mobile shell.

## Three layers, one team per vertical

```
shells/      platform team   the frames that hold the teams' work
  web/         @rsc-mfe/shell: page skeleton, session contract, header + footer fragments, CloudFront
  mobile/      the Expo app: native tab bar around the teams' web pages
apps/        one web app per team; each is its own React Router build and function
  account/     /, /login, /signup, /account, /auth/*  and the <rsc-account-button> fragment
  orders/      /orders
  store/       /store, /store/cart, /store/api/*       and the <rsc-mini-cart> fragment
services/    one internal HTTP API per team, each its own function and table
  orders/      GET /orders                         (orders table)
  cart/        GET /cart, PUT|DELETE /cart/:id     (carts table)
  auth/        no code: Cognito is the service; its infra lives here
```

Every package has its own `package.json`, `index.js` and `infra/` (deploy, role, tables). The
only import allowed across packages is `@rsc-mfe/shell` from an app. `CODEOWNERS` maps each
directory to its team.

## How a page is stitched

An app renders `<Page>` from the shell, which draws three areas:

```html
<rsc-header data-owner="shell">     ← filled at runtime by shells/web's header.js
<main data-owner="orders" …>        ← the app's own route
<rsc-footer data-owner="shell">     ← footer.js
```

The header places the store's mini cart and the account's sign-in button inside itself, each
loaded from its owner. A shell deploy changes the header on every page without rebuilding an
app; an app deploy changes only its own `main`. Add `?stitch` to any URL to outline each area
with its owner and build time, and look at the `x-vertical` response header to see which
function answered.

Every `<rsc-*>` tag ships with server HTML inside it: the nav links, the cart and sign-in
links, the footer line. Crawlers and users without the script yet get that; the fragment's shadow
root covers it once it runs. Anything that must be indexed stays in the page owner's server
render, fragments only add what they own on top.

Auth is a platform contract: `getUser(request)` from `@rsc-mfe/shell` verifies the Cognito
cookie; apps carry no other auth code. Apps call their team's service with the user's access
token as a bearer; the service verifies it and scopes every query to that user.

## Run one team's product on its own

```bash
npm install
DEV_SESSION=me@example.com npm run dev -w services/orders          # :4001, needs AWS creds for DynamoDB
ORDERS_API_URL=http://localhost:4001 DEV_SESSION=me@example.com npm run dev -w apps/orders   # :5173
```

Open `http://localhost:5173/orders`. Header and footer are empty slots until the shell runs too:

```bash
npm run dev -w shells/web                                             # :4000
SHELL_ORIGIN=http://localhost:4000 ORDERS_API_URL=… DEV_SESSION=… npm run dev -w apps/orders
```

`DEV_SESSION` names a signed-in user outside production builds; the service accepts
`Bearer dev` the same way. Links to other teams' pages 404 locally: the integrated site is
CloudFront.

Tests: `npm test -w <package>` (`node --test`, no framework).

## Deploy

Each package deploys itself; order on a fresh account is services → shell → apps.

```bash
services/orders/infra/table.sh <cognito-sub>; services/orders/infra/role.sh; CREATE=1 services/orders/infra/deploy.sh
services/cart/infra/table.sh;                 services/cart/infra/role.sh;   CREATE=1 services/cart/infra/deploy.sh
shells/web/infra/role.sh;                     CREATE=1 shells/web/infra/deploy.sh
apps/account/infra/role.sh; apps/orders/infra/role.sh; apps/store/infra/role.sh
CREATE=1 apps/account/infra/deploy.sh; CREATE=1 apps/orders/infra/deploy.sh; CREATE=1 apps/store/infra/deploy.sh
```

Then one distribution (`shells/web/infra/cloudfront.sh <account-function-host>`) and one origin
per other function: `shells/web/infra/cloudfront-vertical.sh <dist> shell|orders|store <host>`.
Each `deploy.sh` header lists the env it needs (`ORDERS_API_URL`, `CART_API_URL`, the Cognito
ids, `PUBLIC_HOST`). `DRY=1` runs everything up to the AWS call.

### Rolling out

A deploy creates a revision; which revision an endpoint serves is a separate setting (revision
weights). `deploy.sh` moves all traffic to the new revision unless `WEIGHT` says otherwise:

```bash
WEIGHT=10 apps/orders/infra/deploy.sh          # new revision takes 10%, the current one keeps 90%
scripts/lambda-rollout.sh rsc-mfe-orders-web 50  # widen
scripts/lambda-rollout.sh rsc-mfe-orders-web 100 # finish
scripts/lambda-rollout.sh rsc-mfe-orders-web rollback  # 100% back to the previous revision
```

Each step is one endpoint update, live in seconds. Judge health between steps from the logs
(the build id is in `data-build` and `?stitch`); nothing rolls back on its own.
