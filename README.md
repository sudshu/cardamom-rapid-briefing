# CARDAMOM–RAPID interactive progress briefing

[Open the live briefing](https://sudshu.github.io/cardamom-rapid-briefing/)

A dependency-free static site presenting the differentiable RAPID-Chem work in
[`CARDAMOM-framework/CARDAMOM-RAPID`](https://github.com/CARDAMOM-framework/CARDAMOM-RAPID).

`index.html` is a twelve-slide briefing with next/previous buttons, keyboard
navigation, a slide counter, deep links (`#neural`, `#joint`, …) and a
print/read-all view. It covers:

- Equation 42 as a differentiable snapshot operator, solved by sparse
  donor-before-receptor recurrences rather than dense matrices;
- a 13-parameter neural decay field, where tripling the training gauges — not
  changing the network — cut median decay-rate error from 47.2% to 18.7%;
- a reduced five-parameter joint inversion of chemical inputs, a storage
  anomaly and reach decay, separating what the data constrain from what the
  prior does;
- how gauge placement trades storage information against decay information; and
- a misspecified-input stress test in which a +20% chemical load degrades both
  the recovered rates and the concentration fit.

`rapid-chem-explained.html` is a shorter plain-language explanation of the first
experiment in the series.

**Everything published here is a synthetic observing-system simulation
experiment on a real static river topology.** No measured nitrogen or DOC has
been used, no study basin has been finalised, and nothing here establishes
general identifiability. The limits slide states this in full. Curated numbers
with their sources and caveats are in
[`assets/results-2026-09-08.json`](assets/results-2026-09-08.json); the tested
Python package — not this site — is the scientific source of truth.

## Interactive panels

Both browser panels are explanation aids, not model output:

- the five-reach Muskingum hydrograph recomputes the frozen water-routing
  recurrence in JavaScript;
- the 3D network illustration builds a few hundred synthetic reaches and
  evaluates the same steady Equation-42 recurrence in JavaScript.

Neither runs JAX. The 3D panel uses [three.js](https://threejs.org) r180,
vendored locally under `assets/vendor/` (MIT licence), falls back to a static
plan-view illustration when WebGL is unavailable, and disables its flow
animation under `prefers-reduced-motion`.

## Local preview

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Project licensing is inherited from the upstream repository's Apache-2.0
license.
