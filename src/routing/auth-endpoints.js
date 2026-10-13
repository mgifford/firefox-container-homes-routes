// Sign-in pages that must stay in the container the link came from.
//
// Logging in to Claude with a personal Google account has to happen in the
// container Claude runs in, or the session ends up in the wrong place.
// Until Phase 3 tracks whole sign-in flows, these pages are simply never
// routed: not by rules, not by the fallback and not by a one-time override.
//
// Each entry is an exact host (www. aside, no subdomains) and, where the
// provider shares its host with ordinary pages, a whole-segment path
// prefix. Nothing is recognised by words like "login" or "auth" in a URL.
// Coverage is deliberately narrow; see docs/routing.md.
export const AUTH_ENDPOINTS = [
  { provider: "Google", host: "accounts.google.com" },
  { provider: "Microsoft", host: "login.microsoftonline.com" },
  { provider: "Microsoft", host: "login.live.com" },
  { provider: "GitHub", host: "github.com", pathPrefix: "/login" },
  { provider: "GitHub", host: "github.com", pathPrefix: "/session" }
];
