# CARDAMOM–RAPID interactive progress briefing

[Open the live briefing](https://sudshu.github.io/cardamom-rapid-briefing/)

This dependency-free static site presents the verified Option A and B1 work in
[`CARDAMOM-framework/CARDAMOM-RAPID`](https://github.com/CARDAMOM-framework/CARDAMOM-RAPID).
It includes:

- an animated five-reach river network;
- live runoff-pulse and Muskingum travel-time controls;
- a dynamically recomputed reach 3 / reach 5 hydrograph;
- MATLAB parity, gradient, physics, recovery, and held-out evidence;
- an explicit boundary between the converted routing kernel and the broader
  MATLAB research workflows; and
- selectable B2, B3, and B4 discussion paths.

The browser recurrence was checked against the frozen MATLAB R2024b oracle.
Its maximum absolute discharge difference is `1.7763568394002505e-15`.

## Local preview

```bash
cd docs
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The tested JAX package—not the browser visualization—is the scientific source
of truth. See [pull request #1](https://github.com/CARDAMOM-framework/CARDAMOM-RAPID/pull/1)
for the implementation and review history. Project licensing is inherited from
the upstream repository's Apache-2.0 license.
