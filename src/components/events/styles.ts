/**
 * Class strings shared by the events screens. They use plain gray and neutral palettes with `dark:`
 * variants (not the white/NN tints) so a card reads on the light page as well as the dark one.
 */
export const card = 'rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60 dark:shadow-none';
export const cardPad = `${card} p-5`;
export const heading = 'text-gray-900 dark:text-white';
export const body = 'text-gray-700 dark:text-gray-300';
export const muted = 'text-gray-600 dark:text-gray-400';

export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black';

const btn = `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
export const btnPrimary = `${btn} bg-orange-700 text-white hover:bg-orange-800`;
export const btnSecondary = `${btn} border border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-100 dark:hover:bg-neutral-800`;
export const btnDanger = `${btn} bg-red-700 text-white hover:bg-red-800`;
export const btnGhost = `${btn} text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-800`;

export const input = `w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-500 transition-colors focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-gray-500`;
export const inputError = 'border-red-500 focus:border-red-500 focus:ring-red-500/30';
export const label = 'mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200';

export const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium';
export const pageBg = 'min-h-screen bg-gray-50 dark:bg-black';
export const pageWrap = 'mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6';
