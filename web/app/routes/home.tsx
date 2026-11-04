export function meta() {
  return [{ title: "RSC micro-frontend demo" }];
}

export function ServerComponent() {
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">One public surface</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        This page is a React Server Component running on a Lambda Web Function. The orders service behind it has
        no URL; the web function reaches it with IAM. Sign-in is a passkey ceremony whose server half runs here,
        so the browser never talks to Cognito.
      </p>
      <p className="text-neutral-600 dark:text-neutral-400">
        The same pages are what the mobile shell opens in a WebView, with the passkey bound to this domain.
      </p>
    </main>
  );
}
