# Canvas Label Clipping Analysis

## Symptom

The initial desktop and mobile Playwright runs passed layout, axe, and nonblank-canvas assertions,
but manual screenshot inspection showed `Math::LinearAlgebra` clipped inside a fixed-width
Cytoscape node.

## Root Cause

The graph stylesheet assigned every normal node a 76px width and the root a 94px width while label
lengths vary substantially. DOM `scrollWidth` checks cannot inspect Cytoscape's canvas text, and the
pixel assertion only proved that the canvas rendered nontransparent content. Neither test encoded
the semantic requirement that a label be fully readable.

## Correction

Node data now includes a bounded width derived from label length, a matching text width, and a
larger height when the bounded label must wrap. The root selector changes color without overriding
those content-derived dimensions. Cytoscape's `text-overflow-wrap: anywhere` handles long package
identifiers that have no spaces.

## Prevention

- Keep desktop and mobile graph screenshots as browser-test artifacts.
- Manually inspect those screenshots whenever graph style or layout changes.
- Preserve the accessible node list so every visible identifier remains available as DOM text.
- Do not treat axe, DOM overflow checks, or nonblank canvas pixels as proof that canvas labels fit.
