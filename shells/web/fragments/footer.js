// <rsc-footer>: owned and served by the shell at /shell-static/fragments/footer.js.
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
  footer { max-width: 48rem; margin: 0 auto; padding: 24px; border-top: 1px solid var(--line);
    font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--muted); }
  :host { --line: #e5e5e5; --muted: #737373; }
  @media (prefers-color-scheme: dark) { :host { --line: #262626; --muted: #a3a3a3; } }
`;

class Footer extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: "open" }).innerHTML = `<style>${style}</style>${stitch("shell", "#2563eb")}
      <footer>RSC micro-frontend demo · shell built ${BUILD}</footer>`;
  }
}

customElements.define("rsc-footer", Footer);
