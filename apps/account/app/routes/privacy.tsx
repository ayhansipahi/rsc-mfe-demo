export function meta() {
  return [{ title: "Privacy Policy · RSC Shell" }];
}

// The App Store listing links here (Privacy Policy URL). Keep it in step with the app's App Privacy
// answers in App Store Connect.
export function ServerComponent() {
  return (
    <article className="max-w-prose space-y-4 text-neutral-700 dark:text-neutral-300">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Privacy Policy</h1>
      <p>Last updated: 6 November 2026. This policy covers the RSC Shell app and the site at rscmfe.sph.sh.</p>

      <h2 className="text-lg font-semibold">What we keep</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>Your email address, to create your account and sign you in.</li>
        <li>Your password (hashed) or passkey public key. Passkeys stay on your device; we only hold the public half.</li>
        <li>Your cart and your orders, so they show up on every device you sign in on.</li>
      </ul>

      <h2 className="text-lg font-semibold">What we don't keep</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Photos. When you use photo search, the photo goes to Amazon Bedrock to name the products in it and is not
          saved.
        </li>
        <li>Face ID data. Face ID runs on your device; the app only learns whether it succeeded.</li>
      </ul>

      <h2 className="text-lg font-semibold">What we don't do</h2>
      <p>No ads, no analytics, no tracking across apps or sites, and we never sell or share your data. The only cookie is the one that keeps you signed in.</p>

      <h2 className="text-lg font-semibold">Where it lives</h2>
      <p>On Amazon Web Services in the EU (Stockholm). AWS processes it on our behalf only.</p>

      <h2 className="text-lg font-semibold">Deleting your data</h2>
      <p>
        Email <a className="underline" href="mailto:info@ayhansipahi.net">info@ayhansipahi.net</a> from the address on
        your account and we delete the account, cart and orders within 30 days.
      </p>

      <h2 className="text-lg font-semibold">Contact</h2>
      <p>
        Ayhan Sipahi, <a className="underline" href="mailto:info@ayhansipahi.net">info@ayhansipahi.net</a>
      </p>
    </article>
  );
}
