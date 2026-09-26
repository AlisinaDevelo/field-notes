---
title: An architecture graph should know what it doesn't know.
date: 2026-09-23 14:00:00 +0200
sequence: 2
code: MAP
topic: Developer tools
series: Tools
project_name: CARTOGRAPH
project_url: https://github.com/AlisinaDevelo/CARTOGRAPH
project_description: Compiler-backed TypeScript graphs, semantic revision diffs, and evidence-linked reports.
source_label: TypeScript
reading_time: 8
discussion_number: 2
last_modified_at: 2026-09-24 12:12:51 +0200
description: How CARTOGRAPH resolves TypeScript relationships, records source evidence, compares semantic identities, and reports routes it cannot resolve.
---

A line in an architecture diagram reads like a fact. If a tool draws that line from a naming convention or a guess, the graph can be more misleading than a stale hand-drawn diagram. In [CARTOGRAPH](https://github.com/AlisinaDevelo/CARTOGRAPH), I want every relationship to have a traceable reason to exist—and every unsupported relationship to remain visible as a gap.

That leads to a very specific pipeline: load a bounded TypeScript project, resolve supported constructs, emit a canonical graph with evidence, then compare two graph snapshots. Each stage has a contract; none promises a complete map of runtime behavior.

<figure>
  <svg viewBox="0 0 620 188" role="img" aria-labelledby="cartograph-title cartograph-desc">
    <title id="cartograph-title">CARTOGRAPH analysis and uncertainty path</title>
    <desc id="cartograph-desc">TypeScript source and configuration flow through compiler-backed analysis into a canonical graph and semantic diff. Literal routes produce evidence-backed edges, while dynamic routes produce diagnostics.</desc>
    <defs><marker id="cartograph-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z" fill="#31488f"/></marker></defs>
    <g font-family="monospace">
      <rect x="6" y="18" width="130" height="56" fill="#f8f7f1" stroke="#a8afa4"/><text x="71" y="40" text-anchor="middle" fill="#20241f" font-size="10">.ts + tsconfig</text><text x="71" y="57" text-anchor="middle" fill="#69716a" font-size="8">bounded project</text>
      <rect x="164" y="18" width="130" height="56" fill="#d1ed62" stroke="#20241f"/><text x="229" y="40" text-anchor="middle" fill="#20241f" font-size="9">compiler analysis</text><text x="229" y="57" text-anchor="middle" fill="#4f5b3b" font-size="8">imports · calls · routes</text>
      <rect x="322" y="18" width="130" height="56" fill="#f8f7f1" stroke="#a8afa4"/><text x="387" y="40" text-anchor="middle" fill="#20241f" font-size="10">canonical graph</text><text x="387" y="57" text-anchor="middle" fill="#69716a" font-size="8">edges + evidence</text>
      <rect x="480" y="18" width="134" height="56" fill="#f8f7f1" stroke="#a8afa4"/><text x="547" y="40" text-anchor="middle" fill="#20241f" font-size="10">revision diff</text><text x="547" y="57" text-anchor="middle" fill="#69716a" font-size="8">JSON · Markdown · HTML</text>
      <path d="M136 46h24M294 46h24M452 46h24" stroke="#31488f" stroke-width="1.5" marker-end="url(#cartograph-arrow)"/>
      <path d="M310 74v25M170 99h280" stroke="#a8afa4" stroke-width="1.2" stroke-dasharray="4 4"/>
      <rect x="50" y="112" width="240" height="56" fill="#f8f7f1" stroke="#a8afa4"/><text x="170" y="134" text-anchor="middle" fill="#20241f" font-size="9">app.get("/users", loadUsers)</text><text x="170" y="151" text-anchor="middle" fill="#31488f" font-size="8">endpoint + evidenced handler edge</text>
      <rect x="330" y="112" width="240" height="56" fill="#f8f7f1" stroke="#a8afa4"/><text x="450" y="134" text-anchor="middle" fill="#20241f" font-size="9">app.get(routePath, loadUsers)</text><text x="450" y="151" text-anchor="middle" fill="#69716a" font-size="8">UNSUPPORTED_DYNAMIC_ROUTE</text>
    </g>
  </svg>
  <figcaption>Resolution produces either an evidence-backed relationship or an explicit diagnostic.</figcaption>
</figure>

## Resolve the project before drawing edges

The analyzer does more than walk files and match identifier text. It reads TypeScript configuration without executing it, follows supported in-repository `extends` chains and project references, and applies the owning project's compiler options. For Node16 and NodeNext resolution, it passes the file's implied ESM or CommonJS mode to TypeScript's module resolver. That matters when `exports` or `imports` maps expose different targets for `import`, `require`, `node`, and `types` conditions.

The TypeScript analyzer then materializes a `ts-morph` project and extracts modules, callables, imports, calls, and supported framework boundaries. Local calls become edges only when the analyzer can resolve the target under its current semantic rules. Files are processed in canonical order, and graph nodes, edges, and diagnostics are sorted before the snapshot is returned. Identical input should therefore serialize to identical graph JSON.

The documented local flow is intentionally ordinary:

```sh
node dist/cli.js scan /path/to/typescript-project \
  --output .cartograph/current.graph.json
```

The result is a versioned snapshot, not a rendered picture scraped from a running service. It contains typed nodes, typed edges, diagnostics, revision metadata, and the analyzer capability-registry version. The checked-in [`GraphSnapshot` schema](https://github.com/AlisinaDevelo/CARTOGRAPH/blob/main/schema/graph-snapshot.v0.1.schema.json) defines that interchange boundary.

## Evidence travels with each edge

Consider these Express calls:

```ts
app.get("/users", loadUsers);
app.get(routePath, loadUsers);
```

The first path is a literal. In the supported Express slice, CARTOGRAPH can emit an endpoint and a relationship to the local `loadUsers` callable. The second path depends on a runtime value. The analyzer emits an `UNSUPPORTED_DYNAMIC_ROUTE` diagnostic instead of inventing an endpoint from the variable's name.

For a source-backed relationship, evidence records a repository-relative path, source span, versioned detector identity, and content hash. The graph retains no absolute path, source excerpt, or source body. Confidence is categorical: it distinguishes direct semantic evidence from bounded inference; it is not a probability that the edge is true. A relationship without evidence must carry an explicit unresolved reason. These requirements are enforced during canonicalization, so malformed or conflicting graph records fail validation rather than making it into a report.

This gives a reviewer something better than a polished line: the path and span to inspect, the detector that emitted it, and a hash tying the evidence to the analyzed file contents. For an unsupported route, the diagnostic points to the source location and names the construct that stopped resolution. Both are useful results, but they are not interchangeable.

The analyzer's [Express adapter](https://github.com/AlisinaDevelo/CARTOGRAPH/blob/main/src/analyzers/express.ts) makes the route boundary concrete. It handles literal string and no-substitution template paths, selected `app`/`router` receivers, route chains, and bounded `use` middleware. Dynamic mount paths stay diagnostic. The support matrix lists other implemented slices, including imports, resolvable calls, API schema boundaries, Prisma models, lockfiles, queues, and outbound HTTP destinations; each has its own limits.

## A diff compares graph identities

File diffs answer “which text changed?” A graph diff asks which modeled components or relationships changed because of the two source states. CARTOGRAPH compares nodes by `stableKey`, edges by `(from, to, kind)`, and diagnostics by stable ID. If a node or edge keeps its identity but its fields change, the diff keeps before-and-after records and lists the fields that differ. An edge can be classified as evidence-only, confidence-changed, or otherwise changed.

Endpoint rewires need special care. If a route keeps its identity but now points to another handler, a plain set difference looks like one edge was removed and another added. The diff engine can pair them as `endpoint-rewired` only when the match is unambiguous: shared evidence is the strongest signal; otherwise, matching edge kind plus one unchanged endpoint is considered, and the best pairing must be unique in both directions. Ambiguous candidates remain in the added and removed sets. Consumers that only understand ordinary set differences can still read those original sets.

Node identity across refactors is harder than edge identity. The exact stable key is the first signal. For changed keys, the matcher considers compatible node kinds plus signals such as the same name, supplied Git path history, language, and neighboring graph structure. A unique mutual best match can be retained as a lower-confidence identity. Ties, competing candidates, and weak matches become ambiguity or unsupported-rename diagnostics; the matcher does not choose the “closest-looking” node to make a report tidy. The [identity implementation](https://github.com/AlisinaDevelo/CARTOGRAPH/blob/main/src/core/identity.ts) also applies a candidate-search ceiling so a large graph cannot trigger unbounded pairwise comparison.

The two-revision command can make comparison semantics explicit:

```sh
node dist/cli.js diff /path/to/repository \
  --base origin/main --head HEAD --comparison merge-base \
  --format html --output .cartograph/architecture-diff.html
```

`merge-base` is intended for pull-request comparisons and requires full, non-shallow history with a unique merge base. Use `direct` when the two chosen trees themselves are the comparison. Both sides are analyzed locally; the report can render as JSON, Markdown, or self-contained HTML. The [diff contract](https://github.com/AlisinaDevelo/CARTOGRAPH/blob/main/src/core/diff.ts) records which comparison was made and preserves the evidence and diagnostics behind each change.

## Unknown is part of the output

CARTOGRAPH analyzes supported TypeScript constructs. It does not run the repository, import its modules, execute package scripts, contact a network, or observe live traffic. JavaScript, generated routes, framework metaprogramming, reflection, ambiguous calls, and dynamic destinations can exceed the current analyzer model. Some produce diagnostics; none should be silently upgraded to a verified edge. The [quickstart](https://github.com/AlisinaDevelo/CARTOGRAPH/blob/main/docs/QUICKSTART.md) and [support matrix](https://github.com/AlisinaDevelo/CARTOGRAPH/blob/main/docs/SUPPORT_MATRIX.md) spell out that boundary.

This matters especially when reading an empty region of a graph. It might mean a relationship is absent. It might also mean the relevant construct is unsupported or unresolved. Diagnostics preserve the difference, and the report should be read with them in view. CARTOGRAPH is pre-alpha, so neither the current language slice nor the refactor matcher is a claim of universal coverage.

An architecture graph is useful when it lets someone verify a claim and find the places where verification stopped. A source-backed edge, an explicit unresolved reason, and a stable ambiguity record carry more engineering value than a complete-looking diagram that has no account of how it got there.
