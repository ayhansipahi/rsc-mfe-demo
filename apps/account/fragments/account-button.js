// <rsc-account-button>: owned and served by the account team at /fragments/account-button.js.
// The shell's header renders the tag and loads this file; how sign-in works stays in this vertical.
// It reads the account's session contract (/auth/me) and draws its own markup in a shadow root.
// Inside the mobile shell it draws nothing and reports the session to the native tab bar instead.
const shell = window.ReactNativeWebView;

const style = `
  :host { display: inline-flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; line-height: 18px; }
  a, button { font: inherit; color: inherit; border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px;
    background: var(--bg); text-decoration: none; cursor: pointer; }
  .who { max-width: 20ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :host { --bg: #fff; --line: #d4d4d4; }
  @media (prefers-color-scheme: dark) { :host { --bg: #171717; --line: #404040; } }
`;

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const BUILD = "__BUILD__";

// ?stitch: outline this fragment inside its own shadow root (page CSS cannot reach in). Read from
// the URL, not the html class: the page sets that after hydration, which may be after this runs.
const stitch = (owner, color) =>
  new URLSearchParams(location.search).has("stitch")
    ? `<style>:host { position: relative; outline: 2px dashed ${color}; outline-offset: -2px; }
      .stitch-label { position: absolute; top: 0; right: 0; z-index: 20; padding: 2px 6px; font: 11px/1 ui-monospace, monospace; background: ${color}; color: #fff; }</style>
      <span class="stitch-label">${owner} · ${BUILD}</span>`
    : "";

class AccountButton extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      this.dataset.owner = "account";
      this.dataset.build = BUILD;
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
      `<style>${style}</style>${stitch("account", "#dc2626")}` +
      (me.signedIn
        ? // Signed in: who you are, linking to the account page that holds passkeys and sign out.
          `<a class="who" href="/account" title="${escape(me.email)}">${escape(me.email)}</a>`
        : `<a href="/login${next}">Sign in</a>`);
  }
}

customElements.define("rsc-account-button", AccountButton);
