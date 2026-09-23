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
reading_time: 6
description: A diagram becomes dangerous when it draws a route it has not verified. For architecture tooling, uncertainty belongs in the output.
---

Architecture diagrams are persuasive. A line from a route to a handler looks like a fact even if someone drew it from memory six months ago. A tool that generates the line has the same responsibility: show where it came from, or make the gap visible.

That principle shapes [CARTOGRAPH](https://github.com/AlisinaDevelo/CARTOGRAPH), a local tool for scanning supported TypeScript projects, producing a deterministic architecture graph, and comparing two Git revisions. Every emitted relationship carries repository-relative source evidence—or an explicit reason it could not be resolved.

<figure>
  <svg viewBox="0 0 620 166" role="img" aria-labelledby="graph-title graph-desc">
    <title id="graph-title">Three states for an architecture edge</title>
    <desc id="graph-desc">A verified relationship with source evidence, an unresolved relationship with a reason, and an unsupported construct retained as a diagnostic.</desc>
    <path d="M185 49h74m-74 57h74m-74 57h74" stroke="#a8afa4" stroke-width="1.2" stroke-dasharray="4 4"/>
    <g font-family="monospace">
      <rect x="6" y="12" width="179" height="45" fill="#f8f7f1" stroke="#a8afa4"/><text x="20" y="31" font-size="9" fill="#20241f">route → handler</text><text x="20" y="47" font-size="8" fill="#31488f">VERIFIED · source: routes.ts:18</text>
      <rect x="6" y="69" width="179" height="45" fill="#f8f7f1" stroke="#a8afa4"/><text x="20" y="88" font-size="9" fill="#20241f">module → target</text><text x="20" y="104" font-size="8" fill="#69716a">UNRESOLVED · dynamic import</text>
      <rect x="6" y="126" width="179" height="34" fill="#f8f7f1" stroke="#a8afa4"/><text x="20" y="147" font-size="8" fill="#69716a">DIAGNOSTIC · no guessed edge</text>
      <circle cx="285" cy="34" r="9" fill="#d1ed62" stroke="#20241f"/><circle cx="345" cy="34" r="9" fill="#f8f7f1" stroke="#20241f"/><circle cx="412" cy="34" r="9" fill="#f8f7f1" stroke="#20241f"/>
      <circle cx="285" cy="91" r="9" fill="#d1ed62" stroke="#20241f"/><circle cx="345" cy="91" r="9" fill="#f8f7f1" stroke="#20241f"/>
      <circle cx="285" cy="143" r="9" fill="#d1ed62" stroke="#20241f"/><circle cx="345" cy="143" r="9" fill="#f8f7f1" stroke="#20241f"/><circle cx="412" cy="143" r="9" fill="#f8f7f1" stroke="#20241f"/>
      <path d="M294 34h42m18 0h49M294 91h42M294 143h42" stroke="#31488f" stroke-width="1.7"/>
      <text x="474" y="37" font-size="8" fill="#20241f">edge + evidence</text><text x="474" y="94" font-size="8" fill="#20241f">reason, no edge</text><text x="474" y="146" font-size="8" fill="#20241f">uncertainty kept</text>
    </g>
  </svg>
  <figcaption>Resolved, unresolved, and unsupported should remain different states.</figcaption>
</figure>

## Static analysis has an edge

No analyzer sees every runtime path. Dynamic imports, reflective calls, framework conventions, and generated code can all hide relationships from a static pass. There are two tempting mistakes: silently omit the relationship, or infer a plausible edge and make the graph look complete.

Both choices erase useful information. Omission looks like absence. A guess looks like knowledge. CARTOGRAPH keeps unresolved constructs visible as diagnostics instead. The output can say what the analyzer understood, which evidence supports it, and where its current model stops.

## Diff the shape, not just the files

A revision diff can show that files changed; an architecture diff asks what those edits did to the relationships the tool can model. CARTOGRAPH compares two Git revisions and reports added, removed, or changed graph nodes and edges. Deterministic output makes the same source state produce the same snapshot, which gives the diff a stable basis for review.

That is still a structural view, not a complete account of runtime behavior. The graph does not execute the repository. The supported slice is explicit, and unsupported constructs remain visible rather than being presented as covered.

<div class="callout"><strong>Current boundary:</strong> CARTOGRAPH is pre-alpha. Its local TypeScript/Express slice and bounded adapters are implemented; stable identity across refactors and broader framework coverage remain open work. The project page lists the support table and limitations.</div>

## “Unknown” is a useful result

I want architecture tools to help people ask better questions, not replace judgment with a polished picture. An evidence-backed edge can be inspected. An unresolved edge can be investigated. A guessed edge can quietly become part of someone's mental model.

For this kind of tool, “I don't know yet” is not a broken report. It is part of the report—and often the most useful thing in it.
