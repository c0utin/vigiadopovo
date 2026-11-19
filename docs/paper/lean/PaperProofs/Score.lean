/-!
# The deterministic score (paper, Section "A deterministic, replayable score")

Model. Input records of any type `R` carry an identifier `id : R → I`. Identifiers are
compared with a Boolean order `le` that is transitive, total and antisymmetric (for
example `≤` on natural numbers or on strings). The scoring function first sorts its input
by identifier with merge sort and then applies an arbitrary function `f`.

Result: if two inputs are permutations of each other and the identifiers in the input
are unique, the sorted lists are equal, so `f` gives the same output whatever the input
order. Uniqueness is needed: two different records with the same identifier stay in
input order (merge sort is stable), so swapping them changes the sorted list
(`sortById_needs_unique_ids`).

Out of scope: the floating-point and rounding behaviour of the actual score, which the
implementation (`scripts/pipeline/quality.ts`) handles by rounding each share to cents.
-/

namespace PaperProofs.Score

variable {R I : Type _} (id : R → I) (le : I → I → Bool)

/-- Sort records by identifier. -/
def sortById (l : List R) : List R := l.mergeSort fun a b => le (id a) (id b)

variable {id le}

/-- If the images of a list's elements under `f` are distinct, `f` is injective on it. -/
theorem eq_of_nodup_map {α β : Type _} {f : α → β} {a b : α} :
    ∀ {l : List α}, (l.map f).Nodup → a ∈ l → b ∈ l → f a = f b → a = b
  | [], _, ha, _, _ => absurd ha (List.not_mem_nil)
  | x :: l, hnd, ha, hb, hf => by
    rw [List.map_cons, List.nodup_cons] at hnd
    rcases List.mem_cons.mp ha with rfl | ha' <;> rcases List.mem_cons.mp hb with rfl | hb'
    · rfl
    · exact absurd (hf ▸ List.mem_map_of_mem hb') hnd.1
    · exact absurd (hf.symm ▸ List.mem_map_of_mem ha') hnd.1
    · exact eq_of_nodup_map hnd.2 ha' hb' hf

/-- **Sorting removes input order.** If `l₂` is a permutation of `l₁` and the identifiers in
`l₁` are pairwise distinct, sorting both by identifier gives the same list. -/
theorem sortById_eq_of_perm
    (trans : ∀ a b c, le a b = true → le b c = true → le a c = true)
    (total : ∀ a b, (le a b || le b a) = true)
    (antisymm : ∀ a b, le a b = true → le b a = true → a = b)
    {l₁ l₂ : List R} (hperm : l₁.Perm l₂) (huniq : (l₁.map id).Nodup) :
    sortById id le l₁ = sortById id le l₂ := by
  have trans' : ∀ a b c : R, le (id a) (id b) = true → le (id b) (id c) = true →
      le (id a) (id c) = true := fun a b c => trans _ _ _
  have total' : ∀ a b : R, (le (id a) (id b) || le (id b) (id a)) = true :=
    fun a b => total _ _
  apply List.Perm.eq_of_pairwise (le := fun a b => le (id a) (id b) = true)
  · intro a b ha hb hab hba
    have ha₁ : a ∈ l₁ := (List.mergeSort_perm l₁ _).subset ha
    have hb₁ : b ∈ l₁ := hperm.symm.subset ((List.mergeSort_perm l₂ _).subset hb)
    have hid : id a = id b := antisymm _ _ hab hba
    exact eq_of_nodup_map huniq ha₁ hb₁ hid
  · exact List.pairwise_mergeSort trans' total' l₁
  · exact List.pairwise_mergeSort trans' total' l₂
  · exact ((List.mergeSort_perm l₁ _).trans hperm).trans (List.mergeSort_perm l₂ _).symm

/-- **The score does not depend on input order.** Under the same hypotheses, any function
applied after sorting by identifier gives the same result for `l₁` and `l₂`. -/
theorem score_independent_of_order {β : Type _} (f : List R → β)
    (trans : ∀ a b c, le a b = true → le b c = true → le a c = true)
    (total : ∀ a b, (le a b || le b a) = true)
    (antisymm : ∀ a b, le a b = true → le b a = true → a = b)
    {l₁ l₂ : List R} (hperm : l₁.Perm l₂) (huniq : (l₁.map id).Nodup) :
    f (sortById id le l₁) = f (sortById id le l₂) := by
  rw [sortById_eq_of_perm trans total antisymm hperm huniq]

/-- Instance for natural-number identifiers. -/
theorem score_independent_of_order_nat {β : Type _} (id : R → Nat) (f : List R → β)
    {l₁ l₂ : List R} (hperm : l₁.Perm l₂) (huniq : (l₁.map id).Nodup) :
    f (sortById id (fun a b => decide (a ≤ b)) l₁) =
      f (sortById id (fun a b => decide (a ≤ b)) l₂) :=
  score_independent_of_order f
    (fun a b c h₁ h₂ => by simp at *; omega)
    (fun a b => by simp; omega)
    (fun a b h₁ h₂ => by simp at *; omega)
    hperm huniq

/-- **Unique identifiers are needed.** Two records `(1, 0)` and `(1, 1)` sharing
identifier `1` sort differently depending on input order. -/
theorem sortById_needs_unique_ids :
    sortById (fun r : Nat × Nat => r.1) (fun a b => decide (a ≤ b)) [(1, 0), (1, 1)] ≠
      sortById (fun r : Nat × Nat => r.1) (fun a b => decide (a ≤ b)) [(1, 1), (1, 0)] := by
  unfold sortById
  rw [List.mergeSort_of_pairwise (by simp), List.mergeSort_of_pairwise (by simp)]
  simp

end PaperProofs.Score
