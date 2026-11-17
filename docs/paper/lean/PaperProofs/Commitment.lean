import PaperProofs.Collision

/-!
# Content addressing and the manifest (paper, Section "Content addressing and the manifest")

Model.
* `H : Bytes → Digest` is an arbitrary function (SHA-256 in the paper). It is **not**
  assumed to be injective.
* `c : Val → Bytes` is the canonical JSON encoding of an artifact, assumed injective.
* An artifact of kind `k` with value `x` is stored under `keyOf k (H (c x))`.
* The manifest of a run created at time `t` over the artifacts `A` (a list of
  `(kind, value)` pairs) lists, for every artifact, its kind, key, digest and size.
  `encM` encodes the manifest as bytes (assumed injective) and the manifest's name is
  `H (encM M)`.

Result: if two runs have the same manifest name but different artifact lists, one can
point at an explicit collision of `H`, either between the two encoded manifests or
between the two encoded artifacts at the first position where the lists differ. This
is the "one-level Merkle tree" argument of the paper, as a reduction.
-/

namespace PaperProofs.Commitment

variable {Val Bytes Digest Kind Key Time : Type _}

/-- One line of the manifest. -/
structure Entry (Kind Key Digest : Type _) where
  kind : Kind
  key : Key
  digest : Digest
  size : Nat

/-- The manifest: creation time and one entry per artifact, in order. -/
structure Manifest (Time Kind Key Digest : Type _) where
  created : Time
  entries : List (Entry Kind Key Digest)

variable (H : Bytes → Digest) (c : Val → Bytes) (size : Bytes → Nat)
  (keyOf : Kind → Digest → Key)

/-- The manifest entry of an artifact `(k, x)`. -/
def entryOf (a : Kind × Val) : Entry Kind Key Digest :=
  { kind := a.1, key := keyOf a.1 (H (c a.2)), digest := H (c a.2), size := size (c a.2) }

/-- The manifest of a run created at `t` with artifacts `A`. -/
def manifest (t : Time) (A : List (Kind × Val)) : Manifest Time Kind Key Digest :=
  { created := t, entries := A.map (entryOf H c size keyOf) }

/-- The manifest's name: the hash of its encoding. -/
def manifestName (encM : Manifest Time Kind Key Digest → Bytes) (t : Time)
    (A : List (Kind × Val)) : Digest :=
  H (encM (manifest H c size keyOf t A))

/-- Content addressing alone: if two values are stored under the same key (and the key
determines the digest, as `v1/k/<hex digest>.json` does), then either the values are
equal or their encodings are a collision of `H`. -/
theorem content_address_collision
    (hc : ∀ x y, c x = c y → x = y)
    (hkey : ∀ k k' d d', keyOf k d = keyOf k' d' → d = d')
    {k k' : Kind} {x y : Val}
    (hk : keyOf k (H (c x)) = keyOf k' (H (c y))) (hxy : x ≠ y) :
    IsCollision H (c x) (c y) :=
  ⟨fun e => hxy (hc x y e), hkey _ _ _ _ hk⟩

/-- Two lists with equal images under `f` that are not equal differ at some position
`i` whose two elements have the same image under `f`. -/
theorem exists_ne_of_map_eq {α β : Type _} (f : α → β) :
    ∀ {A B : List α}, A.map f = B.map f → A ≠ B →
      ∃ i, ∃ h₁ : i < A.length, ∃ h₂ : i < B.length, A[i] ≠ B[i] ∧ f A[i] = f B[i]
  | [], [], _, hne => absurd rfl hne
  | [], _ :: _, h, _ => by simp at h
  | _ :: _, [], h, _ => by simp at h
  | a :: A, b :: B, h, hne => by
    simp only [List.map_cons, List.cons.injEq] at h
    by_cases hab : a = b
    · subst hab
      have hAB : A ≠ B := fun e => hne (e ▸ rfl)
      obtain ⟨i, h₁, h₂, hn, he⟩ := exists_ne_of_map_eq f h.2 hAB
      exact ⟨i + 1, Nat.succ_lt_succ h₁, Nat.succ_lt_succ h₂, by simpa using hn,
        by simpa using he⟩
    · exact ⟨0, by simp, by simp, hab, h.1⟩

/-- **Manifest binding.** If two runs (created at `t₁`, `t₂`, with artifact lists `A`, `B`)
have the same manifest name but `A ≠ B`, then either the two encoded manifests are a
collision of `H`, or at some position `i` the two encoded artifacts `c A[i]` and
`c B[i]` are a collision of `H`. -/
theorem manifest_collision
    (hc : ∀ x y, c x = c y → x = y)
    (encM : Manifest Time Kind Key Digest → Bytes)
    (hM : ∀ M M', encM M = encM M' → M = M')
    {t₁ t₂ : Time} {A B : List (Kind × Val)}
    (hname : manifestName H c size keyOf encM t₁ A = manifestName H c size keyOf encM t₂ B)
    (hAB : A ≠ B) :
    IsCollision H (encM (manifest H c size keyOf t₁ A)) (encM (manifest H c size keyOf t₂ B)) ∨
    ∃ i, ∃ h₁ : i < A.length, ∃ h₂ : i < B.length, IsCollision H (c A[i].2) (c B[i].2) := by
  by_cases henc : encM (manifest H c size keyOf t₁ A) = encM (manifest H c size keyOf t₂ B)
  · right
    have hman := hM _ _ henc
    simp only [manifest, Manifest.mk.injEq] at hman
    obtain ⟨i, h₁, h₂, hne, heq⟩ := exists_ne_of_map_eq _ hman.2 hAB
    refine ⟨i, h₁, h₂, ?_, ?_⟩
    · intro e
      apply hne
      have hv := hc _ _ e
      have hk := congrArg Entry.kind heq
      simp only [entryOf] at hk
      exact Prod.ext hk hv
    · have hd := congrArg Entry.digest heq
      simpa [entryOf] using hd
  · exact Or.inl ⟨henc, hname⟩

/-- Contrapositive form used in the paper: if `H` has no collision at all, the manifest
name determines the artifact list exactly. (For SHA-256 collisions exist but none is
known, so the meaningful reading is `manifest_collision`.) -/
theorem manifest_name_determines_artifacts
    (hc : ∀ x y, c x = c y → x = y)
    (encM : Manifest Time Kind Key Digest → Bytes)
    (hM : ∀ M M', encM M = encM M' → M = M')
    (hH : ¬ HasCollision H)
    {t₁ t₂ : Time} {A B : List (Kind × Val)}
    (hname : manifestName H c size keyOf encM t₁ A = manifestName H c size keyOf encM t₂ B) :
    A = B := by
  apply Classical.byContradiction
  intro hAB
  rcases manifest_collision H c size keyOf hc encM hM hname hAB with h | ⟨_, _, _, h⟩
  · exact hH h.hasCollision
  · exact hH h.hasCollision

end PaperProofs.Commitment
