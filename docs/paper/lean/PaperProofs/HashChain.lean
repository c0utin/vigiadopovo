import PaperProofs.Collision

/-!
# Hash chain over lake batches (paper, Section "Immutability", proposed running digest)

Model. `h₀` is a fixed starting value and `hₙ = H (hₙ₋₁ ‖ bₙ)`. `H` is an arbitrary
function; the concatenation `‖` is modelled by `pair : Digest → Batch → Bytes`, assumed
injective as a two-argument function. (Concatenation of a fixed-length digest with a
batch identifier is injective, so this holds when `hₙ₋₁` has a fixed length.)

`head bs` is the final value after the batches `bs`, oldest first.

Results.
* `chain_collision_same_length`: equal heads, same length, different contents ⇒ a
  collision of `H`.
* `chain_collision_or_preimage`: for any lengths, equal heads and different contents ⇒
  a collision of `H`, or an input of the form `h ‖ b` that `H` maps to `h₀`.
* `chain_collision_of_not_in_range`: hence if `h₀` is not of the form `H (h ‖ b)`, any
  lengths work.
* `chain_extension_counterexample`: the extra assumption cannot be dropped; with an
  injective `H` (no collisions at all) and `h₀ = H (h₀ ‖ b)`, the chains `[]` and `[b]`
  have the same head.
-/

namespace PaperProofs.HashChain

variable {Bytes Digest Batch : Type _}
variable (H : Bytes → Digest) (pair : Digest → Batch → Bytes) (h₀ : Digest)

/-- The running digest after the batches `bs`, oldest first: `foldl` of
`h ↦ H (h ‖ b)` starting at `h₀`. -/
def head (bs : List Batch) : Digest :=
  bs.foldl (fun h b => H (pair h b)) h₀

/-- The same chain, written with the newest batch first (convenient for induction). -/
def headRev : List Batch → Digest
  | [] => h₀
  | b :: bs => H (pair (headRev bs) b)

theorem headRev_eq_head (l : List Batch) : headRev H pair h₀ l = head H pair h₀ l.reverse := by
  induction l with
  | nil => rfl
  | cons b l ih => simp [head, List.foldl_append, headRev, ih]

theorem head_eq_headRev (bs : List Batch) : head H pair h₀ bs = headRev H pair h₀ bs.reverse := by
  rw [headRev_eq_head, List.reverse_reverse]

variable {H pair h₀}

/-- Core lemma, newest batch first, any lengths. -/
theorem headRev_collision_or_preimage
    (hp : ∀ h h' b b', pair h b = pair h' b' → h = h' ∧ b = b') :
    ∀ l l' : List Batch, headRev H pair h₀ l = headRev H pair h₀ l' → l ≠ l' →
      HasCollision H ∨ ∃ h b, H (pair h b) = h₀
  | [], [], _, hne => absurd rfl hne
  | [], b :: l', heq, _ => Or.inr ⟨headRev H pair h₀ l', b, heq.symm⟩
  | b :: l, [], heq, _ => Or.inr ⟨headRev H pair h₀ l, b, heq⟩
  | b :: l, b' :: l', heq, hne => by
    by_cases hin : pair (headRev H pair h₀ l) b = pair (headRev H pair h₀ l') b'
    · obtain ⟨hh, hb⟩ := hp _ _ _ _ hin
      subst hb
      exact headRev_collision_or_preimage hp l l' hh (fun e => hne (e ▸ rfl))
    · exact Or.inl ⟨_, _, hin, heq⟩

/-- Core lemma, newest batch first, equal lengths. -/
theorem headRev_collision_same_length
    (hp : ∀ h h' b b', pair h b = pair h' b' → h = h' ∧ b = b') :
    ∀ l l' : List Batch, l.length = l'.length →
      headRev H pair h₀ l = headRev H pair h₀ l' → l ≠ l' → HasCollision H
  | [], [], _, _, hne => absurd rfl hne
  | [], _ :: _, hlen, _, _ => by simp at hlen
  | _ :: _, [], hlen, _, _ => by simp at hlen
  | b :: l, b' :: l', hlen, heq, hne => by
    by_cases hin : pair (headRev H pair h₀ l) b = pair (headRev H pair h₀ l') b'
    · obtain ⟨hh, hb⟩ := hp _ _ _ _ hin
      subst hb
      exact headRev_collision_same_length hp l l' (by simpa using hlen) hh
        (fun e => hne (e ▸ rfl))
    · exact ⟨_, _, hin, heq⟩

/-- **Hash chain, same length.** Two batch sequences of the same length with the same
final head but different contents give a collision of `H`. -/
theorem chain_collision_same_length
    (hp : ∀ h h' b b', pair h b = pair h' b' → h = h' ∧ b = b')
    {bs bs' : List Batch} (hlen : bs.length = bs'.length)
    (heq : head H pair h₀ bs = head H pair h₀ bs') (hne : bs ≠ bs') : HasCollision H := by
  rw [head_eq_headRev, head_eq_headRev] at heq
  exact headRev_collision_same_length hp _ _ (by simpa using hlen) heq
    (fun e => hne (by simpa using congrArg List.reverse e))

/-- **Hash chain, any lengths.** Two batch sequences with the same final head but
different contents give a collision of `H` or a preimage of `h₀` of the form `h ‖ b`. -/
theorem chain_collision_or_preimage
    (hp : ∀ h h' b b', pair h b = pair h' b' → h = h' ∧ b = b')
    {bs bs' : List Batch}
    (heq : head H pair h₀ bs = head H pair h₀ bs') (hne : bs ≠ bs') :
    HasCollision H ∨ ∃ h b, H (pair h b) = h₀ := by
  rw [head_eq_headRev, head_eq_headRev] at heq
  exact headRev_collision_or_preimage hp _ _ heq
    (fun e => hne (by simpa using congrArg List.reverse e))

/-- **Hash chain, any lengths, `h₀` outside the range.** If no `h ‖ b` hashes to `h₀`, two
batch sequences of any lengths with the same final head but different contents give a
collision of `H`. -/
theorem chain_collision_of_not_in_range
    (hp : ∀ h h' b b', pair h b = pair h' b' → h = h' ∧ b = b')
    (h₀_fresh : ∀ h b, H (pair h b) ≠ h₀)
    {bs bs' : List Batch}
    (heq : head H pair h₀ bs = head H pair h₀ bs') (hne : bs ≠ bs') : HasCollision H := by
  rcases chain_collision_or_preimage hp heq hne with h | ⟨h, b, hb⟩
  · exact h
  · exact absurd hb (h₀_fresh h b)

/-- **The range assumption is needed.** With `Digest = Nat`, `Batch = Unit`,
`pair h b = (h, b)` (injective), `H (n, ()) = n` (injective, so it has no collision) and
any `h₀`, the empty chain and the one-batch chain have the same head. -/
theorem chain_extension_counterexample (n : Nat) :
    ¬ HasCollision (fun p : Nat × Unit => p.1) ∧
    head (fun p : Nat × Unit => p.1) Prod.mk n [] = head (fun p : Nat × Unit => p.1) Prod.mk n [()] ∧
    ([] : List Unit) ≠ [()] := by
  refine ⟨?_, rfl, by simp⟩
  rintro ⟨⟨a, _⟩, ⟨b, _⟩, hne, heq⟩
  exact hne (by simp_all)

end PaperProofs.HashChain
