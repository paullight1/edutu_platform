# Edutu security backport of deepmerge 4.3.1

Upstream: https://github.com/TehShrike/deepmerge (MIT; original license retained).
CVE-2026-93753 / GHSA-gcqx-w48m-w2h4 has no published upstream fix as of 2026-11-03.

The only behavioral change is that mergeObject defines its three destination writes as own enumerable data properties. This preserves merge results, custom merge callbacks, array semantics and symbols while preventing an own __proto__ key from invoking the prototype setter, including with null-prototype input objects.

This package has a distinct name/version because it is a local security backport, not an upstream release. Remove the override when a reviewed upstream fix is available. The API and learner builds keep identical copies; the dependency regression check verifies both.
