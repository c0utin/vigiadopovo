/-!
# Collisions

A *collision* of a function `H` is a pair of distinct inputs with the same output.
Every security statement in this development is a reduction: it shows that an
attack on the published data yields an explicit collision of `H` (or, in one case,
a preimage). `H` is an arbitrary function; nothing assumes it is injective.
-/

namespace PaperProofs

/-- `x` and `y` form a collision of `H`: they are different, but `H` maps them to the
same value. -/
def IsCollision {α β : Type _} (H : α → β) (x y : α) : Prop :=
  x ≠ y ∧ H x = H y

/-- `H` has some collision. -/
def HasCollision {α β : Type _} (H : α → β) : Prop :=
  ∃ x y, IsCollision H x y

theorem IsCollision.hasCollision {α β : Type _} {H : α → β} {x y : α}
    (h : IsCollision H x y) : HasCollision H :=
  ⟨x, y, h⟩

end PaperProofs
