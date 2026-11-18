/** Local-only password sign-in; refuses to run outside `next dev`. */
export const devLoginEnabled = () =>
  process.env.NODE_ENV === "development" &&
  process.env.GROK_BOT_DEV_LOGIN === "1";
