"use client";

import { NavLink } from "react-router";

const pages = [
  ["/", "Home"],
  ["/store", "Store"],
  ["/orders", "Orders"],
] as const;

export function Nav() {
  return (
    <nav className="flex items-center gap-1 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
      {pages.map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          // Verticals are separate builds behind one domain; a client-side navigation would ask
          // this build's server for another build's tree. Cross-vertical links are document loads.
          reloadDocument
          className={({ isActive, isPending }) =>
            `rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"} ${isPending ? "opacity-60" : ""}`
          }
        >
          {label}
        </NavLink>
      ))}
      {/* Fragments owned by other verticals: the store's mini cart and the account's sign-in
          button. This vertical renders the tags; each owner serves the script that fills them. */}
      <div className="ml-auto flex items-center gap-2">
        <rsc-mini-cart />
        <rsc-account-button />
      </div>
    </nav>
  );
}
