# Routing

How Container Homes Routes decides where a link opens. Nothing is routed
automatically: routing is only used when you ask for it.

## Opening a routed link

Right-click a web link:

- **Open routed link** opens it in a new tab next to the current one, in
  the container its rule chooses. The menu item says where, for example
  "Open routed link in Drupal (Claro)".
- **Open routed link in** lists the other destinations, with the matched
  category's own destinations first, for example the Work development
  container for a Claude link that normally opens in Personal AI. This
  choice applies to that one link only; no rule is created or changed.

If a link can't be routed, for example because its container was removed
or no container has been chosen yet, the menu item is greyed out and says
what to fix. Sign-in pages open in the current container and offer no
alternatives. The menu is hidden in private windows, so private links are
never moved into a normal container. Until routing has been set up (see
[demo/README.md](demo/README.md)), the item is greyed out.

## Matching

- Only `http` and `https` links are routed.
- A rule names a host. Hosts are compared using the address Firefox
  parses, never by searching the link text, so a rule for `drupal.org`
  never matches `evil-drupal.org`, `drupal.org.evil.example`, or a link that
  only mentions drupal.org in its path or query.
- `www.example.org` and `example.org` are the same site.
- **Include subdomains** (planned to be on by default in the rule editor) lets a rule for
  `drupal.org` also match `api.drupal.org`. Off, it matches only the host
  itself (and its `www.` form).
- An optional **path prefix** matches whole path segments: `/project/claro`
  matches `/project/claro/issues/1`, not `/project/claroline`. Paths are
  case-sensitive.

## Precedence

1. **Sign-in pages** (below) always stay where they are.
2. A **one-time override** you choose for this link.
3. Matching rules, highest **priority** number first.
4. Among equal priority, the **most specific** rule: more host parts
   (`team.slack.com` beats `slack.com`), then an exact host over one that
   includes subdomains, then a longer path prefix.
5. The **fallback** destination (usually Misc).
6. Otherwise the link stays where it is.

Two rules that tie at step 4 and lead to different categories are
reported as ambiguous. The one listed first is used until you resolve it.

## Sign-in pages

Signing in to a site has to happen in the same container as the site, or
the session ends up somewhere else. For example, signing in to Claude with
a personal Google account must stay in the container Claude runs in.

These pages are never routed, not even by a one-time override:

| Provider | Pages |
|---|---|
| Google | everything on `accounts.google.com` |
| Microsoft | everything on `login.microsoftonline.com` and `login.live.com` |
| GitHub | `github.com/login…` (including OAuth authorize and device login) and `github.com/session` |

Only these exact pages are recognised. Links are not treated as sign-in
pages because they contain words like "login" or "oauth". Other sign-in
pages (other providers, single sign-on for your organisation, GitHub's
two-factor page at `/sessions/two-factor`) are not recognised yet; route
links to them with care.

Separate containers always have separate sessions, even when you sign in
with the same account in each. Choosing a container does not choose or
sign in to an account for you.
