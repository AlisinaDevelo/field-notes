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
reading_time: 9
discussion_number: 1
last_modified_at: 2026-09-24 12:12:51 +0200
description: Inside StreamHive's SHV1 blob exchange, bytewise live cursor, bounded anti-entropy scheduler, and separate logical lifecycle journal.
---

If a peer acknowledges a blob, one operation finished. It does not prove that the cluster has the same blobs, that an offline peer will catch up, or that a deleted application object will stay deleted.

Those are different properties, so [StreamHive](https://github.com/AlisinaDevelo/StreamHive) gives them different paths. Raw replication moves immutable bytes identified by keys. Anti-entropy compares key inventories and repairs gaps. The optional lifecycle path carries ordered logical records, including tombstones. Treating these as one vague promise called “replication” hides the failure modes.

## The raw exchange, frame by frame

Peers use StreamHive's `SHV1` TCP framing: a four-byte magic value, a big-endian 32-bit payload length, then a JSON message. The message types are deliberately small: `blob.has`, `blob.missing`, `blob.get`, `blob.put`, and `blob.ack`. Byte slices in the JSON payload are base64 encoded. The [protocol document](https://github.com/AlisinaDevelo/StreamHive/blob/main/docs/PROTOCOL.md) defines that wire contract.

<figure>
  <svg viewBox="0 0 620 250" role="img" aria-labelledby="replication-title replication-desc">
    <title id="replication-title">Three separate StreamHive state paths</title>
    <desc id="replication-desc">Raw blobs are verified and acknowledged, anti-entropy follows a bounded inventory cursor, and logical lifecycle changes use versioned journal records.</desc>
    <defs><marker id="replication-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z" fill="#31488f"/></marker></defs>
    <g font-family="monospace">
      <text x="12" y="52" fill="#31488f" font-size="9" letter-spacing="1">BLOB</text>
      <rect x="75" y="22" width="135" height="52" fill="#f8f7f1" stroke="#a8afa4"/><text x="142" y="44" text-anchor="middle" fill="#20241f" font-size="10">blob.put</text><text x="142" y="59" text-anchor="middle" fill="#69716a" font-size="8">key + bytes</text>
      <rect x="255" y="22" width="150" height="52" fill="#d1ed62" stroke="#20241f"/><text x="330" y="44" text-anchor="middle" fill="#20241f" font-size="10">verify + store</text><text x="330" y="59" text-anchor="middle" fill="#4f5b3b" font-size="8">SHA-256 when 32 bytes</text>
      <rect x="450" y="22" width="160" height="52" fill="#f8f7f1" stroke="#a8afa4"/><text x="530" y="44" text-anchor="middle" fill="#20241f" font-size="10">blob.ack</text><text x="530" y="59" text-anchor="middle" fill="#69716a" font-size="8">one receiver, one key</text>
      <path d="M210 48h40M405 48h40" stroke="#31488f" stroke-width="1.5" marker-end="url(#replication-arrow)"/>
      <text x="12" y="132" fill="#31488f" font-size="9" letter-spacing="1">REPAIR</text>
      <rect x="75" y="102" width="135" height="52" fill="#f8f7f1" stroke="#a8afa4"/><text x="142" y="124" text-anchor="middle" fill="#20241f" font-size="10">blob.has</text><text x="142" y="139" text-anchor="middle" fill="#69716a" font-size="8">ordered key pages</text>
      <rect x="255" y="102" width="150" height="52" fill="#d1ed62" stroke="#20241f"/><text x="330" y="124" text-anchor="middle" fill="#20241f" font-size="10">exclusive cursor</text><text x="330" y="139" text-anchor="middle" fill="#4f5b3b" font-size="8">bytewise live view</text>
      <rect x="450" y="102" width="160" height="52" fill="#f8f7f1" stroke="#a8afa4"/><text x="530" y="124" text-anchor="middle" fill="#20241f" font-size="10">missing blobs</text><text x="530" y="139" text-anchor="middle" fill="#69716a" font-size="8">bounded continuation</text>
      <path d="M210 128h40M405 128h40" stroke="#31488f" stroke-width="1.5" marker-end="url(#replication-arrow)"/>
      <text x="12" y="212" fill="#31488f" font-size="9" letter-spacing="1">LOGICAL</text>
      <rect x="75" y="182" width="135" height="52" fill="#f8f7f1" stroke="#a8afa4"/><text x="142" y="204" text-anchor="middle" fill="#20241f" font-size="10">lifecycle record</text><text x="142" y="219" text-anchor="middle" fill="#69716a" font-size="8">present or deleted</text>
      <rect x="255" y="182" width="150" height="52" fill="#d1ed62" stroke="#20241f"/><text x="330" y="204" text-anchor="middle" fill="#20241f" font-size="10">epoch + sequence</text><text x="330" y="219" text-anchor="middle" fill="#4f5b3b" font-size="8">single authority</text>
      <rect x="450" y="182" width="160" height="52" fill="#f8f7f1" stroke="#a8afa4"/><text x="530" y="204" text-anchor="middle" fill="#20241f" font-size="10">journal + watermark</text><text x="530" y="219" text-anchor="middle" fill="#69716a" font-size="8">tombstones retained</text>
      <path d="M210 208h40M405 208h40" stroke="#31488f" stroke-width="1.5" marker-end="url(#replication-arrow)"/>
    </g>
  </svg>
  <figcaption>Blob acceptance, inventory repair, and logical updates carry separate guarantees.</figcaption>
</figure>

An inventory advertisement means “these keys are present here.” It is not a transfer of the blobs themselves. The receiving peer checks the advertised keys against its store and returns the missing subset. The advertiser then reads those blobs and sends `blob.put` messages. The receiver verifies content-addressed keys, stores the bytes, and acknowledges each accepted blob.

```text
peer A                 peer B
  |--- blob.has(keys) --->|
  |<-- blob.missing(K) ---|  B probes its store; K is absent
  |--- blob.put(k, data)->|  B verifies and stores each blob
  |<----- blob.ack(k) ----|
```

The `blob.ack` is useful evidence about that send path: B accepted that key. It is not a durable cluster-wide receipt, and it says nothing about a peer that was disconnected when the exchange happened. StreamHive's ordinary raw write and its anti-entropy scheduler therefore answer different questions. The former has a bounded retry path for one requested operation; the latter revisits peer state over time.

## Integrity and local durability

For a 32-byte SHA-256 key, the receiver checks that the payload hashes to the advertised key before applying it. A mismatch is rejected rather than stored under a false identity. Other key lengths remain opaque identifiers, so callers using them do not get that particular content-address check. This rule is in the [replication apply path](https://github.com/AlisinaDevelo/StreamHive/blob/main/replication/protocol.go) and the [message handler](https://github.com/AlisinaDevelo/StreamHive/blob/main/main.go).

With the file-backed store, `Put` writes a temporary file, syncs it, renames it into place, and syncs the containing directory before returning. The ack is sent after `Put` returns. That orders the application-level acknowledgement after the store's requested filesystem sync steps. It does not certify a disk controller, remote filesystem, or hardware cache that ignores those requests. Memory-backed storage has a different durability boundary altogether. See [`FileStore.Put`](https://github.com/AlisinaDevelo/StreamHive/blob/main/storage/file.go).

There are separate size limits at each layer. A raw frame defaults to 4 MiB; a blob payload defaults to 4 MiB; a repair request defaults to at most 64 MiB of aggregate blob data. The JSON/base64 envelope also consumes frame space, so those two 4 MiB values are not a promise that every maximum-sized blob fits in one frame. Inventory exchanges have their own default caps: 16 MiB of encoded advertisements and 16,384 keys per peer exchange. A budget hit pauses that peer's work and schedules a continuation rather than accumulating an unbounded inventory in memory. These are independent limits, documented in the [protocol](https://github.com/AlisinaDevelo/StreamHive/blob/main/docs/PROTOCOL.md) and [anti-entropy notes](https://github.com/AlisinaDevelo/StreamHive/blob/main/docs/ANTI_ENTROPY.md).

## A live cursor has a consistency model

The native `BlobKeyPager` returns keys in bytewise order after an exclusive cursor. The scheduler retains one cursor per peer, coalesces overlapping startup and periodic triggers, and delays continuation after a budget is reached. If the peer disconnects or the process shuts down, it discards that cursor; reconnect starts a fresh exchange.

This is a live view of a changing store, not a snapshot. Suppose the cursor has advanced past `m`, then a new key `b` is inserted. Since `b` sorts before the cursor, this pass will not revisit it. The next periodic or reconnect exchange is the recovery path. A new key that sorts after the cursor can appear later in the same pass. The current code makes this behavior explicit in its [inventory consistency contract](https://github.com/AlisinaDevelo/StreamHive/blob/main/docs/INVENTORY_CONSISTENCY.md).

That contract affects configuration: `-sync-interval 0s` means startup-only inventory. It does not provide a snapshot or a periodic catch-up guarantee while the store keeps changing. The optional `/inventory/status` endpoint reports a digest over the ordered keys it observed and labels `scan_consistency` as `live`. Equal digests mean two scans saw the same ordered inventory; they are not proofs that both scans read one transactionally pinned store revision.

## Bounded work still needs measurements

One frame limit bounds an individual message, but 65,536 keys can still mean sixteen frames and many receiver probes. The inventory benchmarks record this distinction. On one Apple M1 sample, 65,536 32-byte keys took about 27.8 ms and 30.8 MB of allocations in one flat exchange. Running through the budgeted scheduler took about 5.7 ms and 14.4 MB across five chunks, with the same 16 frames and 3.08 MB on the wire. For 512-byte keys, the corresponding samples were 290 ms and 320 MB flat versus 49 ms and 175 MB budgeted, with 45 MB still sent in both cases.

Those are local measurements, not portable performance guarantees. Four chunks carried the keys; a fifth empty cursor check confirmed the exchange was complete. The budget does not eliminate bytes or receiver-side key probes; it limits how much work one pager invocation holds and creates a scheduling boundary between chunks. The scheduler exports started, completed, limited, dropped, and active exchange counters so operators can see whether repair is finishing or repeatedly being cut short. Details and reproduction commands are in [`docs/ANTI_ENTROPY.md`](https://github.com/AlisinaDevelo/StreamHive/blob/main/docs/ANTI_ENTROPY.md).

## Availability is not logical deletion

The raw namespace is add-only from the perspective of replication. Local eviction or `BlobStore.Delete` does not advertise a logical deletion to peers. If an application record is deleted on one node while another retains it, a raw key inventory cannot decide which logical value should win.

The separate opt-in `lifecycle.v1` path carries logical records. A record includes a namespace, key, state, blob key, authority identity, and `(epoch, sequence)` version. Replicas apply newer versions, accept exact replays idempotently, and reject a same-version record with a different body. A delete becomes a tombstone; it does not physically remove the immutable blob. The implementation uses a durable journal, per-peer acknowledgement watermarks, bounded batches, and a snapshot fallback when a peer is behind the retained journal floor.

That path is disabled by default and uses an operator-fenced single authority per namespace. It does not provide consensus, automatic leader election, or concurrent multiwriter conflict resolution. Keeping this contract in a separate [lifecycle design](https://github.com/AlisinaDevelo/StreamHive/blob/main/docs/LIFECYCLE_V0_13.md) prevents raw anti-entropy from implying deletion semantics it cannot deliver.

## What the ack can honestly say

For StreamHive, a copy is a local storage event. An ack records that one peer accepted that blob. Anti-entropy is the bounded process that compares availability again after drift. Lifecycle records are the separately versioned path for logical state and deletion.

Once those boundaries are visible, “replicated” stops being a comforting adjective and becomes a set of checks you can inspect: which key, which peer, which store, which cursor, which version, and what remains unknown.
