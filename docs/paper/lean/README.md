# Lean proofs for the paper's appendix

Machine-checked proofs of the paper's mathematical claims, in Lean 4 core (no Mathlib).

Toolchain: `leanprover/lean4:v4.36.0` (pinned in `lean-toolchain`).

Check everything (build, then print the axioms of every main theorem):

```sh
lake build && lake env lean CheckAxioms.lean
```

Expected: `Build completed successfully`, and every theorem depends on no axioms or only
on `propext`, `Classical.choice` and `Quot.sound`. The code contains no `sorry`.

| File                          | Claim in the paper                                                |
| ----------------------------- | ----------------------------------------------------------------- |
| `PaperProofs/Collision.lean`  | Definition of a collision                                         |
| `PaperProofs/Commitment.lean` | Content addressing and the manifest (design, §Content addressing) |
| `PaperProofs/HashChain.lean`  | Running digest over lake batches (security, §Immutability)        |
| `PaperProofs/Timestamp.lean`  | OpenTimestamps operation paths (design, §Time)                    |
| `PaperProofs/Alignment.lean`  | Alignment metric, Equation 1 (design, §Metrics)                   |
| `PaperProofs/Score.lean`      | Order-independence of the score (design, §Deterministic score)    |

Hash functions are modelled as arbitrary functions, never as injective ones; the security
results are reductions that exhibit a collision.
