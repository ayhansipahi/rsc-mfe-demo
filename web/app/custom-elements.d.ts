// The two cross-vertical fragments are custom elements; React renders the tags and leaves the rest
// to the scripts each owning vertical serves.
import "react";

type FragmentProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "rsc-account-button": FragmentProps;
      "rsc-mini-cart": FragmentProps;
    }
  }
}
