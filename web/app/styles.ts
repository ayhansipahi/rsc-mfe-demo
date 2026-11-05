// Shared by the client components; plain module, no directive.
export const buttonClass =
  "inline-flex h-9 items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-100 active:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800";
// 16px on phone widths: iOS zooms a page (and a WKWebView) into any focused field whose font is
// smaller than that. Fixing the size keeps pinch-zoom available, unlike maximum-scale=1.
export const inputClass =
  "h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-base sm:h-9 sm:text-sm focus:outline-2 focus:outline-blue-600 dark:border-neutral-700 dark:bg-neutral-900";
