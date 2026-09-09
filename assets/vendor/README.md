# Vendored third-party library

`three.module.min.js` and `three.core.min.js` are the official three.js
**r180** builds, pinned and copied verbatim from
<https://unpkg.com/three@0.180.0/build/>.

| File | SHA-256 |
| --- | --- |
| `three.module.min.js` | `e2b5ee6bccd38fd6d8a2428546b83c5f2426d84b152ef82be8055556e3b40eb6` |
| `three.core.min.js` | `61ba0df005b05991361d040d8ff670e1aadfd0ce7aeebd1fdb0725957a8957de` |

`three.module.min.js` imports `./three.core.min.js`, so both files must stay
side by side. They are vendored rather than loaded from a CDN so the briefing
has no third-party runtime dependency. Licence: MIT, see `THREE-LICENSE.txt`.
