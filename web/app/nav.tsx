"use client";

import { NavLink } from "react-router";

const pages = [
  ["/", "Home"],
  ["/orders", "Orders"],
] as const;

export function Nav() {
  return (
    <nav className="flex gap-1 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
      {pages.map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive, isPending }) =>
            `rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"} ${isPending ? "opacity-60" : ""}`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
