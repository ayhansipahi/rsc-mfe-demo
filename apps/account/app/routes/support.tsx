export function meta() {
  return [{ title: "Support · RSC Shell" }];
}

// The App Store listing links here (Support URL).
export function ServerComponent() {
  return (
    <article className="max-w-prose space-y-4 text-neutral-700 dark:text-neutral-300">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Support</h1>
      <p>
        Questions, problems or feedback about RSC Shell: email{" "}
        <a className="underline" href="mailto:info@ayhansipahi.net">info@ayhansipahi.net</a>. We answer within two
        working days.
      </p>
      <h2 className="text-lg font-semibold">Common questions</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <strong>Photo search finds nothing.</strong> Photo search only knows this store's catalog. Fill the frame with
          one product and try again.
        </li>
        <li>
          <strong>The app asks for Face ID every time.</strong> It locks whenever you leave it, so nobody else can open
          your account on your phone.
        </li>
        <li>
          <strong>Delete my account.</strong> Email us from the address on your account; see the{" "}
          <a className="underline" href="/privacy">privacy policy</a>.
        </li>
      </ul>
    </article>
  );
}
