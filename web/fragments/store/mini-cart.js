// <rsc-mini-cart>: owned and served by the store vertical at /store-static/fragments/mini-cart.js.
// Any vertical's page renders the tag; this file reads the store's cart contract (/store/api/cart),
// shows the item count, and opens the cart lines on click. It re-reads the cart on "cart:changed".
// Inside the mobile shell it draws nothing and reports the count to the native tab bar instead.
const shell = window.ReactNativeWebView;

const style = `
  :host { position: relative; display: inline-block; font: 14px/1.3 ui-sans-serif, system-ui, sans-serif; }
  summary { list-style: none; cursor: pointer; border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; background: var(--bg); }
  summary::-webkit-details-marker { display: none; }
  .count { display: inline-block; min-width: 1.4em; padding: 0 6px; margin-left: 6px; border-radius: 999px;
    background: var(--fg); color: var(--bg); text-align: center; font-weight: 600; }
  .panel { position: absolute; right: 0; top: calc(100% + 6px); z-index: 10; width: 260px; padding: 12px;
    border: 1px solid var(--line); border-radius: 8px; background: var(--bg); box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); }
  ul { list-style: none; margin: 0 0 10px; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; }
  .muted { color: var(--muted); }
  a { color: inherit; }
  :host { --bg: #fff; --fg: #171717; --line: #d4d4d4; --muted: #525252; }
  @media (prefers-color-scheme: dark) { :host { --bg: #171717; --fg: #f5f5f5; --line: #404040; --muted: #a3a3a3; } }
`;

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

class MiniCart extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      addEventListener("cart:changed", () => this.refresh());
      addEventListener("pageshow", () => this.refresh());
    }
    this.refresh();
  }

  async refresh() {
    const cart = await fetch("/store/api/cart")
      .then((r) => r.json())
      .catch(() => ({ signedIn: false, count: 0, lines: [] }));
    if (shell) {
      shell.postMessage(JSON.stringify({ type: "cart", count: cart.count }));
      return;
    }
    // Signed out there is no cart to show; the account button offers sign-in.
    if (!cart.signedIn) {
      this.shadowRoot.innerHTML = "";
      return;
    }
    const open = this.shadowRoot.querySelector("details")?.open ? " open" : "";
    const lines = cart.lines.length
      ? `<ul>${cart.lines
          .map((l) => `<li><span>${escape(l.name)}</span><span class="muted">x${l.qty}</span></li>`)
          .join("")}</ul>`
      : `<p class="muted">Your cart is empty.</p>`;
    this.shadowRoot.innerHTML = `<style>${style}</style>
      <details${open}>
        <summary aria-label="Cart, ${cart.count} items">Cart<span class="count">${cart.count}</span></summary>
        <div class="panel">${lines}<a href="/store/cart">View cart</a></div>
      </details>`;
  }
}

customElements.define("rsc-mini-cart", MiniCart);
