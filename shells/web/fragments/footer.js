// <rsc-footer>: owned and served by the shell at /shell-static/fragments/footer.js.
const BUILD = "__BUILD__";

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
    this.dataset.build = BUILD;
    this.attachShadow({ mode: "open" }).innerHTML = `<style>${style}</style>
      <footer>RSC micro-frontend demo · shell built ${BUILD}</footer>`;
  }
}

customElements.define("rsc-footer", Footer);
