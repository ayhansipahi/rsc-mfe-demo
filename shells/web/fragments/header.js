// <rsc-header>: owned and served by the shell at /shell-static/fragments/header.js. Every app's
// page renders the tag; this file draws the site nav and places the two team-owned fragments
// (store's mini cart, account's sign-in button) inside it, loading each from its owner. The apps
// know nothing about either. Cross-app links are full document loads: each app is its own build.
const BUILD = "__BUILD__";

// ?stitch: outline this fragment inside its own shadow root (page CSS cannot reach in). Read from
// the URL, not the html class: the page sets that after hydration, which may be after this runs.
const stitch = (owner, color) =>
  new URLSearchParams(location.search).has("stitch")
    ? `<style>:host { position: relative; outline: 2px dashed ${color}; outline-offset: -2px; }
      .stitch-label { position: absolute; top: 0; right: 0; z-index: 20; padding: 2px 6px; font: 11px/1 ui-monospace, monospace; background: ${color}; color: #fff; }</style>
      <span class="stitch-label">${owner} · ${BUILD}</span>`
    : "";

const style = `
  :host { display: block; }
  nav { display: flex; align-items: center; gap: 4px; padding: 8px 16px; border-bottom: 1px solid var(--line);
    font: 14px/18px ui-sans-serif, system-ui, sans-serif; min-height: 49px; box-sizing: border-box; }
  a { color: var(--muted); text-decoration: none; border-radius: 6px; padding: 6px 12px; }
  a:hover { background: var(--hover); }
  a[aria-current="page"] { background: var(--fg); color: var(--bg); }
  .right { margin-left: auto; display: flex; align-items: center; gap: 8px; min-width: 0; }
  :host { --bg: #fff; --fg: #171717; --line: #e5e5e5; --muted: #525252; --hover: #f5f5f5; }
  @media (prefers-color-scheme: dark) { :host { --bg: #171717; --fg: #fff; --line: #262626; --muted: #a3a3a3; --hover: #262626; } }
`;

const pages = [
  ["/", "Home"],
  ["/store", "Store"],
  ["/orders", "Orders"],
];

const owners = ["/fragments/account-button.js", "/store-static/fragments/mini-cart.js"];

class Header extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const here = location.pathname;
    const links = pages
      .map(([to, label]) => {
        const active = to === "/" ? here === "/" : here.startsWith(to);
        return `<a href="${to}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
      })
      .join("");
    this.attachShadow({ mode: "open" }).innerHTML = `<style>${style}</style>${stitch("shell", "#2563eb")}
      <nav>${links}<div class="right"><rsc-mini-cart></rsc-mini-cart><rsc-account-button></rsc-account-button></div></nav>`;
    for (const src of owners) {
      if (!document.querySelector(`script[src="${src}"]`)) {
        const s = document.createElement("script");
        s.type = "module";
        s.src = src;
        document.head.append(s);
      }
    }
  }
}

customElements.define("rsc-header", Header);
