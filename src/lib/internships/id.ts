/** Whether a path segment can be a cohort id (24 hex characters). Pure, so the server code and the page that asks again in the browser share it. */
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export const isCohortId = (value: string): boolean => OBJECT_ID.test(value);
