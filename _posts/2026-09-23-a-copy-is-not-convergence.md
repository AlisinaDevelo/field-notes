---
title: A copy is not convergence.
date: 2026-09-23 13:00:00 +0200
sequence: 1
code: SYS
topic: Distributed systems
series: Systems
project_name: StreamHive
project_url: https://github.com/AlisinaDevelo/StreamHive
project_description: Go library and CLI for experimenting with distributed, content-addressed storage.
source_label: Go / TCP
reading_time: 5
description: Replication moves bytes. Convergence is the work that starts after a peer misses one, loses an acknowledgement, or comes back late.
---

A successful write is a local fact. A system with more than one node has a second question to answer: did the other copies get there, too—and what happens if they didn't?

That's why I keep the *put* path and the repair path separate in [StreamHive](https://github.com/AlisinaDevelo/StreamHive). A one-shot put waits for a matching acknowledgement and retries within a finite budget. That can handle a lost acknowledgement or a short interruption. It cannot promise that a peer which was offline for hours will catch up.

<figure>
  <svg viewBox="0 0 620 132" role="img" aria-labelledby="repair-title repair-desc">
    <title id="repair-title">The repair loop in four bounded steps</title>
    <desc id="repair-desc">A write is acknowledged, peers compare inventories, missing keys are requested, and repair continues within a bounded budget.</desc>
    <defs><marker id="repair-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z" fill="#31488f"/></marker></defs>
    <path d="M118 57H177M273 57h59M426 57h58" stroke="#31488f" stroke-width="1.5" marker-end="url(#repair-arrow)"/>
    <g font-family="monospace" text-anchor="middle">
      <rect x="12" y="25" width="106" height="64" rx="2" fill="#f8f7f1" stroke="#a8afa4"/><text x="65" y="51" fill="#20241f" font-size="10">WRITE</text><text x="65" y="69" fill="#69716a" font-size="8">ack or retry</text>
      <rect x="177" y="25" width="96" height="64" rx="2" fill="#f8f7f1" stroke="#a8afa4"/><text x="225" y="51" fill="#20241f" font-size="10">COMPARE</text><text x="225" y="69" fill="#69716a" font-size="8">key inventory</text>
      <rect x="332" y="25" width="94" height="64" rx="2" fill="#d1ed62" stroke="#20241f"/><text x="379" y="51" fill="#20241f" font-size="10">REPAIR</text><text x="379" y="69" fill="#4f5b3b" font-size="8">missing blobs</text>
      <rect x="484" y="25" width="124" height="64" rx="2" fill="#f8f7f1" stroke="#a8afa4"/><text x="546" y="51" fill="#20241f" font-size="10">CONTINUE</text><text x="546" y="69" fill="#69716a" font-size="8">within a budget</text>
    </g>
  </svg>
  <figcaption>One write has a finite retry budget. Catch-up is a separate, bounded loop.</figcaption>
</figure>

## Two loops, two guarantees

StreamHive's peer inventory exchange is the slower loop. It runs at startup and periodically, compares paged inventories, and asks for keys the local store is missing. Repair responses are bounded; a large exchange can continue later instead of growing into unbounded work.

That distinction changes what a healthy signal means. “The write was accepted” describes one operation. “The peers are converging” describes a continuing process across time, restarts, network limits, and storage state. I want the system to expose enough counters and status to tell those stories apart.

## Integrity before repair

There is little value in repairing a replica with bytes that do not match the key they claim to represent. For content-addressed blobs, StreamHive checks key and content at apply and repair-source boundaries. A damaged source is skipped rather than sent as a valid repair.

The hash does not solve every storage problem. It gives one precise check: these bytes match this content-derived key. It does not tell a node how to resolve conflicting application-level records or discover every peer in a changing network.

<div class="callout"><strong>Boundary matters:</strong> StreamHive experiments with static-peer replication, bounded repair, and durable blob storage. It does not implement global discovery or conflict resolution. I prefer that boundary written down over a broader claim the code cannot support.</div>

## Repair is normal work

Distributed storage is often introduced as “copy this object to another machine.” That is the postcard version. The operational version is a loop: accept, acknowledge, compare, repair, and report when the loop is limited or incomplete.

A copy gets the bytes somewhere once. A repair path gives the system a way to notice when reality drifted—and a bounded way to move it closer again.
