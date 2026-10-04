---
title: Search results need a chain of custody.
date: 2026-10-04 12:10:00 +0200
sequence: 5
code: SRC
topic: Retrieval systems
series: Evidence
project_name: LOOM
project_url: https://github.com/AlisinaDevelo/LOOM
project_description: Local evidence retrieval with canonical SQLite records, source anchors, and rebuildable search projections.
source_label: Rust / SQLite
reading_time: 12
discussion_number: 5
description: Inside LOOM's canonical passage store, disposable FTS projection, collision-free highlights, Unicode coordinates, and verified source opening.
---

Finding a passage and proving which source it came from are separate operations. A search index can rank the right words while retaining an old file version, constructing an inaccurate highlight, or resolving a path whose bytes have changed since indexing. The result can look convincing long after its evidence has drifted.

[LOOM](https://github.com/AlisinaDevelo/LOOM) is a local retrieval system built around recovering exact source artifacts. Its architecture gives search permission to suggest a candidate, then requires the source-opening path to check that candidate again. SQLite stores artifacts, versions, passages, and anchors; full-text and semantic indexes are rebuildable derivatives of those records.

This note follows public revision [`187de07`](https://github.com/AlisinaDevelo/LOOM/tree/187de073d6259a0e3c6b7db307394359c65aad0b). It describes the current pre-alpha implementation, including the boundaries that prevent a search result from becoming a stronger claim than the source checks support.

## Give canonical records and indexes different authority

The local data model separates an artifact's identity from its changing content. An artifact points to an active version. That version records a content hash, byte size, extractor identity and version, and extraction metadata. Passages belong to a version and carry text plus a structured locator.

A text locator includes character and line ranges. A PDF locator additionally names a page. An image-OCR locator carries region geometry, image dimensions, orientation, scale, and extraction confidence. These locators describe where extracted evidence belongs; a ranking score cannot supply that information after the fact. The definitions are in [`domain.rs`](https://github.com/AlisinaDevelo/LOOM/blob/187de073d6259a0e3c6b7db307394359c65aad0b/crates/loom-core/src/domain.rs).

SQLite's FTS5 projection is attached to the canonical passage table using external content. The inverted index supplies term matches and rank; passage records supply text and source identity. Insert, update, and delete triggers maintain the projection during ordinary writes. Rebuild recreates it from canonical passages.

<figure>
  <svg viewBox="0 0 620 280" role="img" aria-labelledby="evidence-title evidence-desc">
    <title id="evidence-title">Canonical records constrain LOOM's derived retrieval paths</title>
    <desc id="evidence-desc">Selected local source bytes produce canonical artifact versions, passages, and anchors. FTS and local semantic derivatives produce candidates. Verified opening checks active version, current source hash, and passage membership before showing evidence.</desc>
    <defs><marker id="evidence-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z" fill="#31488f"/></marker></defs>
    <g font-family="monospace" font-size="11" fill="#20241f">
      <rect x="10" y="100" width="120" height="68" fill="#f8f7f1" stroke="#a8afa4"/><text x="70" y="125" text-anchor="middle">selected files</text><text x="70" y="145" text-anchor="middle" font-size="10" fill="#69716a">current bytes</text>
      <rect x="165" y="91" width="148" height="86" fill="#d1ed62" stroke="#20241f"/><text x="239" y="117" text-anchor="middle">canonical SQLite</text><text x="239" y="137" text-anchor="middle" font-size="10">version + passage</text><text x="239" y="154" text-anchor="middle" font-size="10">hash + anchor</text>
      <rect x="357" y="21" width="145" height="59" fill="#f8f7f1" stroke="#a8afa4"/><text x="429" y="45" text-anchor="middle">FTS projection</text><text x="429" y="63" text-anchor="middle" font-size="10">rebuildable</text>
      <rect x="357" y="190" width="145" height="59" fill="#f8f7f1" stroke="#a8afa4"/><text x="429" y="214" text-anchor="middle">local vectors</text><text x="429" y="232" text-anchor="middle" font-size="10">rebuildable</text>
      <rect x="525" y="100" width="85" height="68" fill="#f8f7f1" stroke="#a8afa4"/><text x="567" y="124" text-anchor="middle">candidate</text><text x="567" y="145" text-anchor="middle" font-size="10">IDs + hash</text>
      <path d="M130 134h30M313 134h19V50h20M332 134v85h20M502 50h65v45M502 219h65v-46" fill="none" stroke="#31488f" stroke-width="1.5" marker-end="url(#evidence-arrow)"/>
      <text x="239" y="211" text-anchor="middle" font-size="10" fill="#31488f">verified opening rechecks:</text><text x="239" y="230" text-anchor="middle" font-size="10" fill="#69716a">active tuple + source bytes</text><text x="239" y="248" text-anchor="middle" font-size="10" fill="#69716a">+ passage membership</text>
    </g>
  </svg>
  <figcaption>A candidate carries a route back to canonical evidence. Relevance alone cannot authorize a substitute source.</figcaption>
</figure>

External-content FTS tables need explicit consistency maintenance. SQLite can return canonical rows for a query without `MATCH` even when the inverted index has no corresponding entries. Looking at row count through the virtual table alone can therefore give false reassurance. SQLite documents this behaviour and the rebuild path in its [external-content pitfalls](https://www.sqlite.org/fts5.html#external_content_table_pitfalls).

The practical architectural rule is that a broken search projection may impair discovery while leaving the canonical evidence recoverable. Repair should regenerate the projection from records that retain their identity and locators. Re-running extraction would be a different operation, potentially with changed extractor behaviour and different passage boundaries.

## Check a derivative with an independent reconstruction

LOOM's `fts-health` combines several checks. It counts canonical passages, counts distinct indexed documents through the FTS instance vocabulary, requests FTS integrity checking, and compares the stored index's vocabulary digest against a temporary FTS index rebuilt from canonical text using the same tokenizer.

That tokenizer is `unicode61 remove_diacritics 2`. The comparison asks whether the actual derived vocabulary agrees with what the canonical text should produce under that configuration. A separate canonical passage digest covers ordered passage row IDs and their stored text hashes. The report includes both expected and actual derivative digests alongside the canonical digest. See [`fts_health` and its helpers](https://github.com/AlisinaDevelo/LOOM/blob/187de073d6259a0e3c6b7db307394359c65aad0b/crates/loom-core/src/store.rs).

The important property is independent construction: the expected side does not merely reread the same inverted index and declare it consistent with itself. It builds a new temporary projection from canonical passages. Comparing only the number of rows would miss wrong tokens with unchanged coverage.

`fts-repair` executes FTS's rebuild command in a transaction and returns health reports before and after. It does not rewrite canonical artifacts, versions, text, or anchors:

```sql
INSERT INTO passages_fts(passages_fts) VALUES ('rebuild');
```

The before-and-after canonical digest supplies a useful invariant for that operation: repairing the derivative should leave canonical passage identity and stored hashes unchanged. The health report is still a consistency check for these structures, not a signed provenance attestation or a complete diagnosis of storage hardware.

A repair tool earns trust by making its write set small and showing which invariant survived. Here the write target is disposable search state. That choice also makes search-engine replacement possible without redefining the identity of the evidence.

## Treat highlights as a structured projection

FTS5's `highlight()` wraps matching terms with caller-supplied marker strings. It is tempting to ask for `<mark>` and `</mark>`, then render the result as HTML. But passages can already contain those strings, and passage text may contain other markup. A literal source fragment must remain literal.

LOOM chooses markers that are absent from the current canonical passage. It starts with private-use Unicode delimiters around an incrementing suffix:

```rust
let start = format!("\u{e000}LOOM-{suffix:016x}-START\u{e001}");
let end = format!("\u{e000}LOOM-{suffix:016x}-END\u{e001}");
if !passage.contains(&start) && !passage.contains(&end) {
    return (start, end);
}
```

The actual helper scans suffixes until both markers are collision-free for that passage. Private-use characters alone are insufficient: they are valid source characters too. The absence check is what distinguishes inserted boundaries from literal content. See [`collision_free_markers`](https://github.com/AlisinaDevelo/LOOM/blob/187de073d6259a0e3c6b7db307394359c65aad0b/crates/loom-core/src/search.rs).

The projection parser then reads the highlighted string and emits segments containing text plus a `highlighted` boolean. It rejects nested starts, unmatched ends, unclosed spans, empty spans, and a match with no highlighted evidence. Finally it concatenates all segment text and requires exact equality with the stored passage:

```text
concatenate(segment.text for every segment) == canonical passage text
```

This equality is the central check. A highlight operation may add boundaries, but after removing those boundaries it must reproduce the evidence exactly. Returning plausible words in approximately the right region would be insufficient.

The resulting segments allow a viewer to create highlighting elements around text without treating source content as HTML. A passage containing `<script>` is text to display, not instructions from the retrieval engine. Structured projection and safe rendering work together; neither a score nor a marker format alone establishes that boundary.

## Name the coordinate system before calculating offsets

Rust strings use UTF-8 byte indexing, while the evidence anchors use character positions. The parser needs both: a byte cursor to walk the highlighted string and recognize marker prefixes, and a source-character cursor that advances only over passage characters. Marker bytes must never shift source offsets.

For an illustrative source string:

```text
café retry

"retry" UTF-8 byte range:         [6, 11)
"retry" Unicode scalar range:    [5, 10)
```

The `é` uses two UTF-8 bytes but one Rust `char`. Using byte offset six as a character offset would select the wrong part of the text. The implementation advances `byte_cursor` by `character.len_utf8()` and `source_char_cursor` by one.

Rust `char` means a Unicode scalar value. It is not a displayed grapheme cluster: an `e` followed by a combining accent consists of two scalar values while often appearing as one glyph. Any frontend applying these locators needs to preserve that coordinate convention. JavaScript string offsets introduce another system, UTF-16 code units, so copying an integer directly between the two runtimes is not generally valid.

After parsing highlight ranges, LOOM computes an evidence anchor spanning the first match through the last match. Line positions are derived from newline counts in the canonical character sequence. A PDF anchor retains its page; OCR retains the extraction region's geometry and confidence. The bounding span can contain unmatched text between separate hits. It should not be interpreted as a claim that every character in that span matched.

These details are in [`project_fts_evidence`](https://github.com/AlisinaDevelo/LOOM/blob/187de073d6259a0e3c6b7db307394359c65aad0b/crates/loom-core/src/search.rs). They turn a highlight from decoration into a checkable transformation over source coordinates.

## Apply eligibility before ranking and truncation

The query parser gives readers free text, exact phrases, and explicit filters: modification dates, media type, path substring, and OCR confidence. It compiles text into a constrained FTS expression and binds values rather than exposing arbitrary SQL. A filter-only query is rejected; at least one text term is required. The [query contract](https://github.com/AlisinaDevelo/LOOM/blob/187de073d6259a0e3c6b7db307394359c65aad0b/docs/QUERY.md) documents the syntax and errors.

Filter order changes correctness. Suppose the raw top ten matches all come from an excluded directory and the eleventh is eligible. Truncating first and filtering afterward produces no results even though an eligible candidate exists. It can also let a later semantic merger reintroduce records that should never have entered the candidate set.

LOOM applies canonical metadata and anchor filters before lexical sorting and truncation. The semantic path uses the same parsed filters, so hybrid fusion receives eligible inputs. A ranker can choose among those candidates; it cannot make an excluded source eligible by awarding it a large similarity score.

The lexical path sorts by raw FTS5 BM25 ascending, followed by deterministic tie breakers. SQLite's BM25 implementation assigns better matches numerically lower values. LOOM also returns a transformed `score` calculated as `1 / (1 + abs(raw_bm25))`. That display value is not a calibrated relevance probability, and the ordering is determined by the raw score, not by assuming larger transformed values are better.

That distinction is easy to lose when an API returns a convenient number between zero and one. Ordering, similarity, extraction confidence, and probability answer different questions. The source-opening decision below uses identity and bytes rather than any of those scores.

## Revalidate the hit when the reader opens it

The evidence request binds four identifiers:

```rust
pub struct ResolveEvidenceRequest {
    pub artifact_id: String,
    pub version_id: String,
    pub passage_id: String,
    pub content_hash: String,
}
```

A path alone is mutable. An artifact ID alone can point to a newer version. A passage ID alone needs proof that it belongs to the version the reader selected. LOOM keeps the tuple so each relationship can be checked.

First, `resolve_verified_artifact_path` verifies that the artifact is active, its source root is enabled, its locator is active, and its current version and stored hash match the request. It releases the database mutex while reading the selected file through the stable-hash path. Then it reacquires the mutex and checks the locator, root, version, and hash tuple again.

That second read matters because indexing or source-root changes could occur while filesystem I/O was in progress. Holding a database mutex across a file read would delay unrelated database work; releasing it without rechecking would accept a result against potentially changed state. The code chooses to do I/O outside the lock and validate that the relevant state survived.

Next, `resolve_verified_evidence` selects the passage through the active artifact version and requires all four requested fields to match. An unrelated passage or an old version cannot silently become the current evidence. The successful response returns canonical passage text and its anchor, plus extraction metadata. Both stages are in the [verified resolver](https://github.com/AlisinaDevelo/LOOM/blob/187de073d6259a0e3c6b7db307394359c65aad0b/crates/loom-core/src/store.rs).

A failure should remain visible. If a file has changed, disappeared, or been re-indexed into a different active version, the old hit must lead to a stale or unavailable result and a recovery choice. Substituting the new file at the same path would make the interface convenient while changing the evidence underneath the reader.

There is also a precise limit: checking current bytes does not pin a mutable path forever. A file can change after verification or before an external application reads it. The returned path is a verified locator at the check boundary, not an immutable file capability. Stronger handoff guarantees would need a retained snapshot or a platform-specific handle contract.

## Keep semantic retrieval replaceable too

The same architecture extends to the optional local semantic derivative. Current LOOM uses a deterministic hash-embedding baseline: token hashes and adjacent-token bigrams accumulate into a fixed-size vector, followed by L2 normalization. It downloads no model and makes no demonstrated semantic-quality claim. The provider exists to exercise a versioned, replaceable derivative contract; see [`semantic.rs`](https://github.com/AlisinaDevelo/LOOM/blob/187de073d6259a0e3c6b7db307394359c65aad0b/crates/loom-core/src/semantic.rs).

Rebuild binds vectors to passage text hashes and a provider manifest. Search checks provider compatibility and the current canonical passage digest. A changed corpus or incompatible manifest requires rebuild instead of quietly mixing vectors from different representations.

L2-normalized vectors permit dot-product similarity, but a reproducible vector says little about whether retrieval finds the right evidence. Token hashing can collide; lexical neighbourhood can miss paraphrases. Quality needs labelled queries, known relevant artifacts, recall measurements, latency, and a corpus whose use is permitted. LOOM's synthetic benchmark fixtures can exercise plumbing and ranking contracts without proving performance on a person's entire document collection.

Replaceability is valuable even before the best model exists. It lets a future provider compete on retrieval quality while inheriting the same passage identity, filtering, and verified-opening rules.

## Try the invariants on a small local source

From the pinned checkout, with the Rust toolchain required by its manifest available, create a small source directory and a separate scratch database:

```sh
git clone https://github.com/AlisinaDevelo/LOOM.git
cd LOOM
git checkout 187de073d6259a0e3c6b7db307394359c65aad0b
scratch_dir="$(mktemp -d)"
mkdir "$scratch_dir/notes"
printf '%s\n' 'The retry anomaly began after the timeout change.' \
  > "$scratch_dir/notes/incident.md"

cargo run --locked -p loom-cli -- \
  --database "$scratch_dir/library.sqlite3" \
  index "$scratch_dir/notes"

cargo run --locked -p loom-cli -- \
  --database "$scratch_dir/library.sqlite3" \
  search 'retry anomaly'
```

Inspect the returned artifact, version, passage, hash, and anchor together. Then request projection health and repair:

```sh
cargo run --locked -p loom-cli -- \
  --database "$scratch_dir/library.sqlite3" fts-health

cargo run --locked -p loom-cli -- \
  --database "$scratch_dir/library.sqlite3" fts-repair
```

The CLI's actual command definitions are in [`main.rs`](https://github.com/AlisinaDevelo/LOOM/blob/187de073d6259a0e3c6b7db307394359c65aad0b/crates/loom-cli/src/main.rs). On a healthy projection, the report should retain the same canonical digest and consistent derivative state. Rebuild is useful as a maintenance boundary even when it has nothing to fix.

The evidence viewer currently shows extracted text with page or OCR-region metadata; it does not render original PDF pages or original image pixels. Historical version metadata also does not promise retention of older original bytes. The index is consequently a retrieval system with source checks, not an archival backup of every file version.

This architecture makes one useful promise inspectable: search can change its ranking, tokenizer, or vector provider without silently changing which source a passage claims to describe. The last step is always to earn the connection back to canonical records and current source bytes.
