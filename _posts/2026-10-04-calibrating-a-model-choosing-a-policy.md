---
title: Calibrating a model, choosing a policy.
date: 2026-10-04 12:05:00 +0200
sequence: 4
code: ML
topic: Machine learning
series: Decisions
project_name: Quorabust
project_url: https://github.com/AlisinaDevelo/Quorabust
project_description: Question-pair classification with explicit probability semantics, frozen benchmark roles, and a FastAPI serving boundary.
source_label: Python / ML
reading_time: 13
discussion_number: 4
description: From five lexical features to calibrated probabilities, question-component holdouts, and a decision threshold whose error costs are explicit.
---

Suppose a service returns `0.82` for two questions and says they are duplicates. To interpret that response, we need to know what produced the number, what population it describes, and which rule turned it into a decision. A cosine similarity, a classifier output, and an estimated duplicate probability can all live between zero and one while carrying different meanings.

[Quorabust](https://github.com/AlisinaDevelo/Quorabust) makes this chain inspectable: build pair features, score a classifier, optionally calibrate its output, then compare the effective probability with a decision threshold. The serving response includes the intermediate probabilities and the threshold's source. That separation becomes especially useful when the cost of merging distinct questions differs from the cost of leaving a duplicate unresolved.

This note follows public revision [`d1ddc62`](https://github.com/AlisinaDevelo/Quorabust/tree/d1ddc623e2450189b67d7b2b5f84ab0928586373). The worked examples are illustrative arithmetic. The later benchmark table is explicitly attributed to the repository's corrected evaluation record.

## Start with the actual feature vector

The lexical control uses a TF–IDF vocabulary of at most 4,096 features, with unigram and bigram tokens. The pair classifier receives five values, in this order:

```text
[cos, jaccard, len_ratio, abs_len_diff, len_sum]
```

Cosine measures the normalized dot product of the two TF–IDF vectors. Jaccard compares sets of cleaned word tokens. The remaining values describe word counts. In mathematical form:

```text
cos          = dot(v₁, v₂) / (norm(v₁) × norm(v₂))
jaccard      = |tokens₁ ∩ tokens₂| / |tokens₁ ∪ tokens₂|
len_ratio    = min(words₁, words₂) / max(words₁, words₂, 1)
abs_len_diff = |words₁ − words₂|
len_sum      = words₁ + words₂
```

The implementation assigns zero cosine when the denominator is zero. Its Jaccard helper returns one for two empty token sets, although the strict benchmark audit rejects missing or blank question text before freezing roles. These edge cases matter when reading an explanation returned by the service. See [`PairFeatureBuilder`](https://github.com/AlisinaDevelo/Quorabust/blob/d1ddc623e2450189b67d7b2b5f84ab0928586373/src/quorabust/features.py).

The vectorizer fits the training questions. That includes learning the vocabulary and inverse document frequencies, so it belongs inside the training boundary. Fitting it on the full dataset before splitting would expose the representation to held-out text even if the tree learner never sees held-out labels.

The default classifier is XGBoost: 200 estimators, maximum depth six, learning rate 0.1, with row and column subsampling. When an explicit evaluation frame is supplied, training uses it for early stopping. The raw output is the classifier's positive-class probability estimate over these features. There is no rule that makes a cosine of `0.82` imply an 82-percent duplicate frequency.

This small representation also has a visible ceiling. Strong token overlap can survive a changed negation, quantity, or constraint; different wording can express the same intent. A tree can learn useful interactions in the five inputs, but those inputs do not contain a complete semantic account of the questions. That limitation explains why model comparison needs a stronger candidate and a carefully separated evaluation protocol.

## Separate the four jobs the data performs

The benchmark freezer creates four roles: `train`, `tuning`, `calibration`, and `final_holdout`. Each role pays for a different decision in the pipeline.

<figure>
  <svg viewBox="0 0 620 260" role="img" aria-labelledby="roles-title roles-desc">
    <title id="roles-title">Four frozen data roles in Quorabust</title>
    <desc id="roles-desc">Question-ID components are assigned whole to training, tuning, calibration, or final holdout. Training fits the representation and classifier; tuning selects stopping and policy; calibration fits the probability mapping; final holdout evaluates the frozen pipeline.</desc>
    <defs><marker id="roles-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z" fill="#31488f"/></marker></defs>
    <g font-family="monospace" font-size="11" fill="#20241f">
      <rect x="145" y="12" width="330" height="51" fill="#d1ed62" stroke="#20241f"/><text x="310" y="33" text-anchor="middle">question-ID connected components</text><text x="310" y="49" text-anchor="middle" font-size="10">whole components → separate roles</text>
      <path d="M310 63v30M73 93h474M73 93v27M231 93v27M389 93v27M547 93v27" fill="none" stroke="#31488f" stroke-width="1.5"/>
      <rect x="10" y="120" width="126" height="100" fill="#f8f7f1" stroke="#a8afa4"/><text x="73" y="144" text-anchor="middle">train</text><text x="73" y="169" text-anchor="middle" font-size="10">vocabulary</text><text x="73" y="188" text-anchor="middle" font-size="10">classifier fit</text>
      <rect x="168" y="120" width="126" height="100" fill="#f8f7f1" stroke="#a8afa4"/><text x="231" y="144" text-anchor="middle">tuning</text><text x="231" y="169" text-anchor="middle" font-size="10">early stopping</text><text x="231" y="188" text-anchor="middle" font-size="10">threshold policy</text>
      <rect x="326" y="120" width="126" height="100" fill="#f8f7f1" stroke="#a8afa4"/><text x="389" y="144" text-anchor="middle">calibration</text><text x="389" y="169" text-anchor="middle" font-size="10">probability</text><text x="389" y="188" text-anchor="middle" font-size="10">mapping fit</text>
      <rect x="484" y="120" width="126" height="100" fill="#f8f7f1" stroke="#a8afa4"/><text x="547" y="144" text-anchor="middle">final holdout</text><text x="547" y="169" text-anchor="middle" font-size="10">frozen pipeline</text><text x="547" y="188" text-anchor="middle" font-size="10">evaluation</text>
      <text x="310" y="247" text-anchor="middle" font-size="10" fill="#69716a">Requested fractions: 70% / 10% / 10% / 10%; component sizes constrain actual fractions.</text>
    </g>
  </svg>
  <figcaption>Separate roles protect the final evaluation from choices already made while building the system.</figcaption>
</figure>

`train` fits the representation and classifier. `tuning` can select the training stopping point and the later operating threshold. `calibration` fits a mapping over outputs from the already trained classifier. `final_holdout` evaluates the completed pipeline after those choices are frozen.

If a threshold is selected by sweeping the final holdout and choosing the best result, that holdout has become tuning data. Printing all threshold results for diagnosis is also useful, but repeatedly changing the next model based on them consumes the holdout's independence. A file can retain its name while losing its experimental role.

The calibration CLI enforces part of this contract: calibration and threshold files must differ in both path and byte hash. Calibration cannot reuse the input artifact's training or evaluation file hash. Reusing an explicitly supplied evaluation role for threshold selection requires `--allow-evaluation-threshold`; that is how the frozen tuning role can serve both early stopping and policy selection. The exception is recorded in metadata. See [`calibration_cli.py`](https://github.com/AlisinaDevelo/Quorabust/blob/d1ddc623e2450189b67d7b2b5f84ab0928586373/src/quorabust/calibration_cli.py).

Hashes prevent some accidental reuse, but differently ordered copies of the same questions have different bytes. They are provenance checks, not statistical independence proofs. Complete question identifiers and the split procedure supply the stronger boundary.

## Split the question graph before the rows

Question-pair data has a dependency structure that a shuffled row split can miss. Imagine three rows:

```text
(question A, question B)
(question B, question C)
(question C, question D)
```

Putting the first row in training and the third in holdout leaves a chain of shared question identities through the middle row. At least some of the text or its neighbourhood can cross roles. Quorabust's splitter treats each question ID as a vertex and every pair row as an edge. It unions `qid1` and `qid2`, then assigns entire connected components to roles.

Every pair contributes an edge, including pairs labelled nonduplicate. This graph encodes co-occurrence in the dataset; its components are not semantic equivalence classes. Negative labels still carry shared identities and can connect distant parts of the corpus.

The [union-find implementation](https://github.com/AlisinaDevelo/Quorabust/blob/d1ddc623e2450189b67d7b2b5f84ab0928586373/src/quorabust/split.py) shuffles components with a seeded NumPy generator. It fills nontraining roles toward requested row targets while preserving whole components, then gives the remaining components to training. A large component can push a role beyond its target. The splitter checks that all four roles are nonempty, contain both label classes, and have disjoint question-ID sets.

This is a precise guarantee about supplied IDs. Two identical questions with different IDs can still cross roles. Paraphrase families, domains, authors, and time may require additional grouping. If nearly all rows form one giant component, a component-disjoint split may be impossible or leave unrepresentative roles. Refusing such a split is more useful than silently replacing it with random rows.

The freezer reports actual row fractions and label counts. Seed 42 does not make a skewed sample representative; it makes one assignment repeatable under the same input and implementation.

## Fit probability meaning on independent data

Calibration asks whether predicted probabilities correspond to observed positive frequencies in a specified population. A reliability bin whose mean prediction is `0.8` should contain roughly 80-percent positives, subject to sampling uncertainty. Calibration is evaluated over collections of predictions; it cannot certify the correctness of an individual answer.

Quorabust supports two one-dimensional mappings. Its sigmoid implementation fits `LogisticRegression` directly to the base classifier's probability output:

```text
p_calibrated = 1 / (1 + exp(−(a × p_raw + b)))
```

That detail matters. The independent variable here is `p_raw`, not an assumed logit or decision margin. The code does not constrain the learned coefficient `a` to be positive. An increasing sigmoid preserves ordering when `a > 0`; inspect the fitted parameters instead of inferring that property from the class name.

The isotonic path fits `IsotonicRegression(out_of_bounds="clip")`. It learns a nondecreasing mapping from score to empirical probability and clips predictions beyond its fitted score range. A flexible mapping can fit calibration data very closely and still generalize poorly. Ties introduced by isotonic mapping can also change ranking metrics. The implementation and serialized parameters are in [`calibration.py`](https://github.com/AlisinaDevelo/Quorabust/blob/d1ddc623e2450189b67d7b2b5f84ab0928586373/src/quorabust/calibration.py).

The report provides ten equal-width reliability bins by default, each with a count, mean prediction, observed positive rate, and absolute error. Its expected calibration error is:

```text
ECE = Σ over nonempty bins b:
      (count_b / count_all) × |mean_probability_b − positive_rate_b|
```

Empty bins are omitted; `1.0` belongs to the final bin. Bin count and boundaries affect the result. A small ECE can hide a poorly sampled high-confidence region or opposite errors inside one bin. Read the bin counts and rates alongside the aggregate.

The Brier score averages `(p − y)²`; log loss penalizes confident mistakes more sharply. Both evaluate more than calibration alone, including discrimination. A lower Brier score therefore does not by itself prove a better calibrated model, as the [scikit-learn calibration guide](https://scikit-learn.org/stable/modules/calibration.html) explains. Quorabust's [report implementation](https://github.com/AlisinaDevelo/Quorabust/blob/d1ddc623e2450189b67d7b2b5f84ab0928586373/src/quorabust/report.py) keeps these measurements together.

## Derive the policy from the error costs

Once a probability has a useful empirical interpretation, the application still needs a decision rule. Assume correct decisions have zero cost, a false duplicate costs `C_FP`, and a missed duplicate costs `C_FN`. For a calibrated posterior probability `p`, expected loss is:

```text
declare duplicate:      C_FP × (1 − p)
declare nonduplicate:   C_FN × p

choose duplicate when:
p ≥ C_FP / (C_FP + C_FN)
```

With a false-positive cost four times the false-negative cost, the idealized boundary is `4 / 5 = 0.8`. This derivation assumes the probability describes the deployment population, the costs are known and constant, and there are only two actions. It does not establish that `0.8` is optimal on every finite sample.

Quorabust implements a finite candidate sweep. It can maximize F1, precision, recall, or accuracy, or minimize normalized weighted errors:

```text
empirical cost = (C_FP × FP + C_FN × FN) / number_of_rows
```

These are different policy objectives. F1 does not encode an arbitrary application's error costs. In a small illustrative tuning set, the difference is visible:

```python
import numpy as np
from quorabust.model import select_decision_threshold

y = np.array([0, 0, 0, 1, 0, 1, 1, 1])
p = np.array([0.10, 0.20, 0.40, 0.45, 0.55, 0.60, 0.80, 0.90])

policy = select_decision_threshold(
    y, p,
    thresholds=[0.3, 0.5, 0.8],
    optimize_for="expected_cost",
    false_positive_cost=4.0,
    false_negative_cost=1.0,
)
print(policy["threshold"], policy["expected_cost"])
# 0.8 0.25
```

The probabilities in this example are invented for demonstrating the selector; they are not benchmark predictions. The call uses the real [`select_decision_threshold`](https://github.com/AlisinaDevelo/Quorabust/blob/d1ddc623e2450189b67d7b2b5f84ab0928586373/src/quorabust/model.py) API, available after installing the pinned project.

<div class="table-viewport" role="region" aria-label="Illustrative decision threshold tradeoffs" tabindex="0" markdown="1">

| Threshold | FP | FN | F1 | Weighted errors / 8 |
| ---: | ---: | ---: | ---: | ---: |
| 0.30 | 2 | 0 | 0.800 | 1.000 |
| 0.50 | 1 | 1 | 0.750 | 0.625 |
| 0.80 | 0 | 2 | 0.667 | 0.250 |

</div>

F1 prefers `0.30` here; the supplied cost policy prefers `0.80`. Both results are correct answers to their respective objectives. The implementation breaks equal-cost ties by F1, then accuracy, then proximity to `0.5`; a complete tie retains the earlier candidate. Those details belong in reproducible policy selection because they determine which artifact gets promoted.

## Read the benchmark without collapsing its tradeoffs

The repository's [corrected strict v2 record](https://github.com/AlisinaDevelo/Quorabust/blob/d1ddc623e2450189b67d7b2b5f84ab0928586373/docs/REAL_BENCHMARK_RESULT.md) reports 404,348 source rows after removing three missing or blank-text rows. Its final holdout has 40,437 pairs and a positive rate of 0.3685. The table below selects two of its candidates; thresholds were chosen on tuning data, calibration was fit on its own role, and both rows use the same final holdout.

<div class="table-viewport" role="region" aria-label="Two candidates from Quorabust's recorded strict benchmark" tabindex="0" markdown="1">

| Candidate | Threshold | ROC-AUC | Brier | ECE | F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| TF–IDF + XGBoost + isotonic | 0.30 | 0.7896 | 0.1761 | 0.0063 | 0.6711 |
| Direct Quora cross-encoder + isotonic | 0.40 | 0.9731 | 0.0596 | 0.0034 | 0.8940 |

</div>

The cross-encoder is materially stronger on this holdout. That row is direct pretrained scoring evidence; it is not a serialized safe Quorabust model artifact. Its recorded CPU scoring throughput is approximately 184 pairs per second on the final holdout, with roughly 1.6 GB peak process RSS. The lexical safe artifact's warm single-process pass is approximately 34,839 pairs per second, with a 354,745-byte artifact and roughly 232 MB peak RSS. These are repository-recorded local profiles with different execution paths; they are not deployment latency SLOs.

The four roles establish separation within this experiment. They do not audit a pretrained model's earlier exposure to Quora data. The cross-encoder's own training lineage needs separate consideration before interpreting this comparison as generalization to unseen questions or a different domain.

The supported control remains the safely packaged lexical artifact in that record. The stronger candidate still needs safe packaging, prediction parity, representative-domain evaluation, and deployment load evidence. Model quality, startup, memory, and artifact trust each supply a separate constraint. A leaderboard metric cannot stand in for all four.

The record also retains a superseded protocol and explains the missing-text failure that caused its correction. That history matters: corrected inputs generate new hashes and a new evaluation boundary. Carrying old quality numbers forward without the correction would splice incompatible experiments together.

## Keep the deployed response inspectable

The service chooses its threshold in this order: request override, artifact metadata, a valid `QUORABUST_DECISION_THRESHOLD`, then `0.5`. It returns effective `probs`, `raw_probs`, optional `calibrated_probs`, `is_duplicate`, `decision_threshold`, `decision_threshold_source`, and `probability_source`. See the [prediction route](https://github.com/AlisinaDevelo/Quorabust/blob/d1ddc623e2450189b67d7b2b5f84ab0928586373/src/quorabust/serve.py).

When a calibrated wrapper is present, the boolean is computed from calibrated probabilities. When it is absent, the raw classifier estimate is effective. A request override changes the decision without refitting the model or calibrator. Consumers can inspect that difference rather than reverse-engineer it from a boolean.

For your own permitted question-pair CSV, the frozen-role procedure is reproducible from the pinned checkout after installation. The input needs nonblank `question1` and `question2`, binary `is_duplicate`, and complete `qid1` and `qid2`. Use new output paths; the freezer refuses to overwrite existing role files:

```sh
quorabust-freeze-protocol \
  --csv /external/quora/question_pairs.csv \
  --out-dir /external/quora/quorabust-roles \
  --audit-out /external/quora/quorabust-audit.json \
  --split-out /external/quora/quorabust-split.json \
  --seed 42 \
  --tuning-fraction 0.1 \
  --calibration-fraction 0.1 \
  --final-holdout-fraction 0.1
```

Those external paths represent data you supply; the raw dataset is not included in the repository. Follow the [benchmark protocol](https://github.com/AlisinaDevelo/Quorabust/blob/d1ddc623e2450189b67d7b2b5f84ab0928586373/docs/BENCHMARK_PROTOCOL.md) to bind training, calibration, and reports to the frozen hashes. A validated protocol records experimental ownership. It does not itself establish permission to use the dataset, inspect every row, or prove model quality.

A useful ML service leaves enough information to answer three practical questions after deployment: which model produced this score, how was its probability meaning measured, and why did this policy choose that action? Preserving those answers is what makes a threshold change an accountable engineering decision.
