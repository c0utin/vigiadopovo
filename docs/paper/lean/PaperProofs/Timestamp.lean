import PaperProofs.Collision

/-!
# OpenTimestamps paths (paper, Section "Time: anchoring the manifest in Bitcoin")

Model. A message is a byte string, modelled as `List α`. A complete OpenTimestamps
proof is a list of operations applied left to right: append a fixed byte string,
prepend a fixed byte string, or apply a hash function. The hash functions form a
family `Hf : HashId → List α → List α` (OpenTimestamps allows SHA-256 and a few others;
the Bitcoin Merkle path itself uses SHA-256). No hash function is assumed injective.

Result: if the same operation list takes two different starting digests to the same
value (the Merkle root in a block header), one of the hash functions used has an
explicit collision. Hence a calendar cannot reuse an existing proof for another
document without finding a collision.

Scope: this says nothing about *time*. That the root is in a block, and what that
block's timestamp bounds, comes from the Bitcoin block chain and lies outside this
model.
-/

namespace PaperProofs.Timestamp

/-- One operation of a timestamp proof. -/
inductive Op (α HashId : Type _) where
  | append (s : List α)
  | prepend (s : List α)
  | hash (i : HashId)

variable {α HashId : Type _} (Hf : HashId → List α → List α)

/-- Apply one operation to a message. -/
def Op.apply : Op α HashId → List α → List α
  | .append s, m => m ++ s
  | .prepend s, m => s ++ m
  | .hash i, m => Hf i m

/-- Apply a list of operations, left to right. -/
def run : List (Op α HashId) → List α → List α
  | [], m => m
  | op :: ops, m => run ops (op.apply Hf m)

/-- **No proof reuse.** If one operation list maps two different starting digests to the
same result, then one of the hash functions in the list has a collision. -/
theorem run_collision :
    ∀ (ops : List (Op α HashId)) {m m' : List α}, m ≠ m' → run Hf ops m = run Hf ops m' →
      ∃ i, HasCollision (Hf i)
  | [], _, _, hne, heq => absurd heq hne
  | op :: ops, m, m', hne, heq => by
    by_cases hstep : op.apply Hf m = op.apply Hf m'
    · cases op with
      | append s => exact absurd (List.append_cancel_right hstep) hne
      | prepend s => exact absurd (List.append_cancel_left hstep) hne
      | hash i => exact ⟨i, m, m', hne, hstep⟩
    · exact run_collision ops hstep heq

/-- **No proof reuse, single hash function.** With SHA-256 as the only hash operation,
two different starting digests taken to the same root by one operation list give a
collision of SHA-256. -/
theorem run_collision_single (H : List α → List α) (ops : List (Op α Unit)) {m m' : List α}
    (hne : m ≠ m') (heq : run (fun _ => H) ops m = run (fun _ => H) ops m') :
    HasCollision H := by
  obtain ⟨_, h⟩ := run_collision (fun _ => H) ops hne heq
  exact h

end PaperProofs.Timestamp
