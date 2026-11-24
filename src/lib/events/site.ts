/** The public address of the site, for links that leave it (calendar entries, canonical URLs). Safe in the browser. */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://thecyberhub.org').replace(/\/$/, '');
