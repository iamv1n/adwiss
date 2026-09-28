/** Base URL of the Adwise web app (e.g. https://app.adwise.io). Set NEXT_PUBLIC_APP_URL per environment. */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export const LOGIN_URL = `${APP_URL}/login`;
export const SIGNUP_URL = `${APP_URL}/signup`;
