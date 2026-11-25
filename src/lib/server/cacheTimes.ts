/**
 * How long the app server keeps the public copy of one item (an event, a program, a roadmap, a resource,
 * a company, a mentor, a job, a lab) it fetched for a page. A page answers 200 from that copy, so an item
 * that was unpublished keeps answering 200 until the copy is replaced: a minute, plus the refresh that
 * the first visit after it triggers. Kept short on purpose; the areas that have a purge route
 * (`/api/revalidate/*`) drop it at once when staff save.
 */
export const PUBLIC_ITEM_REVALIDATE_SECONDS = 60;
