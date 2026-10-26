# Maintenance notes

Decisions about dependencies and tooling that aren't obvious from the code.

## npm audit: node-forge via web-ext (2026-10-26)

`npm audit` reports 3 high-severity vulnerabilities:

```
node-forge  *   (GHSA-86w9-cpqp-85rv: RSA PKCS#1 v1.5 signature
                 verification accepts extra nested DigestAlgorithm elements)
└─ @devicefarmer/adbkit
   └─ web-ext >=5.2.0
```

**Decision: not fixed. Do not run `npm audit fix --force`.**

- The advisory affects all node-forge versions (`*`); we already have the
  latest (1.4.0). There is no patched version to upgrade or override to.
- The "fix" npm offers is a downgrade of web-ext from 10.x to 5.1.0, which
  predates Manifest V3 support and the current AMO signing API, so `lint` and
  `sign` would likely break.
- web-ext is a dev dependency only. node-forge is reached through `adbkit`,
  which is used solely for running the extension on Firefox for Android over
  adb (`web-ext run -t firefox-android`). Our scripts (`lint`, `start`,
  `build`, `sign`) don't use that path.
- Nothing from web-ext is included in the packaged extension uploaded to AMO.

**Revisit when** web-ext or `@devicefarmer/adbkit` releases a version with a
fixed node-forge (or drops it), or a patched node-forge appears — then a
normal `npm update` (or an `overrides` entry for node-forge) should clear the
audit warnings.
