// <rsc-account-button>: owned and served by the account vertical at /fragments/account-button.js.
// Any vertical's page renders the tag and loads this file; how sign-in works stays in this vertical.
// It reads the account's session contract (/auth/me) and draws its own markup in a shadow root.
// Inside the mobile shell it draws nothing and reports the session to the native tab bar instead.
const shell = window.ReactNativeWebView;

const style = `
  :host { display: inline-flex; align-items: center; gap: 8px; font: 14px/1.2 ui-sans-serif, system-ui, sans-serif; }
  a, button { font: inherit; color: inherit; border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px;
    background: var(--bg); text-decoration: none; cursor: pointer; }
  .who { color: var(--muted); max-width: 16ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  form { margin: 0; }
  :host { --bg: #fff; --line: #d4d4d4; --muted: #525252; }
  @media (prefers-color-scheme: dark) { :host { --bg: #171717; --line: #404040; --muted: #a3a3a3; } }
`;

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

class AccountButton extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      addEventListener("pageshow", () => this.refresh());
    }
    this.refresh();
  }

  async refresh() {
    const me = await fetch("/auth/me")
      .then((r) => r.json())
      .catch(() => ({ signedIn: false }));
    if (shell) {
      shell.postMessage(JSON.stringify({ type: "session", signedIn: me.signedIn, email: me.email }));
      return;
    }
    const here = location.pathname + location.search;
    const next = location.pathname === "/login" ? "" : `?next=${encodeURIComponent(here)}`;
    this.shadowRoot.innerHTML =
      `<style>${style}</style>` +
      (me.signedIn
        ? `<span class="who" title="${escape(me.email)}">${escape(me.email)}</span>
           <form method="post" action="/logout"><button type="submit">Sign out</button></form>`
        : `<a href="/login${next}">Sign in</a>`);
  }
}

customElements.define("rsc-account-button", AccountButton);
