/-!
# The alignment metric (paper, Section "Metrics with public formulas", Equation 1)

Model. The input for a year `a` and a leadership `b` is a list of vote records. Each
record carries the party registered on the vote, the deputy's position, and `b`'s
orientation for that voting. Positions are `Sim`, `Não`, `Abstenção`, `Obstrução`
(the set `V`), the presiding deputy's `Art. 17`, and any other label (absences and
anything else the source may contain). A record *counts* only if `b` oriented `Sim`
or `Não` in its voting.

    numer p rs = |{v ∈ rs : party v = p, b oriented Sim/Não, vote v ∈ V, vote v = orientation v}|
    denom p rs = |{v ∈ rs : party v = p, b oriented Sim/Não, vote v ∈ V}|

Results:
(a) `numer_le_denom`, `alignment_mem_unit`: numerator ≤ denominator, so the ratio is in
    `[0, 1]` when the denominator is positive. As in Equation 1, the numerator keeps the
    condition `vote v ∈ V`, so this bound follows directly from the definitions.
(b) `numer_perm`, `denom_perm`: both counts ignore the order of the records.
(c) `numer_filter_V`, `denom_filter_V`, `counts_eq_of_perm_filter_V`,
    `numer_append_outside_V`, `denom_append_outside_V`: records whose position is outside
    `V` (absences, Art. 17) never change either count.
(d) `sum_denom`, `sum_numer`: summing over a duplicate-free list of parties that covers
    every record's party gives the party-independent totals (the counts partition the
    votes).
-/

namespace PaperProofs.Alignment

/-- A recorded position, or an orientation. -/
inductive Pos where
  | sim
  | nao
  | abstencao
  | obstrucao
  | art17
  | other (label : String)
  deriving DecidableEq

/-- Membership in `V = {Sim, Não, Abstenção, Obstrução}`. -/
def Pos.inV : Pos → Bool
  | .sim | .nao | .abstencao | .obstrucao => true
  | _ => false

/-- The orientation is `Sim` or `Não`. -/
def Pos.isSimNao : Pos → Bool
  | .sim | .nao => true
  | _ => false

/-- One vote record: party registered on the vote, the vote, and the leadership's
orientation for that voting. -/
structure Vote (P : Type _) where
  party : P
  vote : Pos
  orientation : Pos

variable {P : Type _} [DecidableEq P]

/-- Record contributes to the numerator (party aside). -/
def numerPred (r : Vote P) : Bool :=
  r.orientation.isSimNao && r.vote.inV && decide (r.vote = r.orientation)

/-- Record contributes to the denominator (party aside). -/
def denomPred (r : Vote P) : Bool := r.orientation.isSimNao && r.vote.inV

/-- Numerator of Equation 1 for party `p`. -/
def numer (p : P) (rs : List (Vote P)) : Nat :=
  rs.countP fun r => decide (r.party = p) && numerPred r

/-- Denominator of Equation 1 for party `p`. -/
def denom (p : P) (rs : List (Vote P)) : Nat :=
  rs.countP fun r => decide (r.party = p) && denomPred r

/-- Equation 1 as a rational number. -/
def alignment (p : P) (rs : List (Vote P)) : Rat :=
  (numer p rs : Rat) / (denom p rs : Rat)

/-! ## (a) bounds -/

omit [DecidableEq P] in
theorem numerPred_le_denomPred (r : Vote P) (h : numerPred r = true) : denomPred r = true := by
  simp only [numerPred, denomPred, Bool.and_eq_true] at *
  exact ⟨h.1.1, h.1.2⟩

/-- **(a) Numerator ≤ denominator.** For every party, the number of its votes that match
the orientation is at most the number of its votes in `V`. -/
theorem numer_le_denom (p : P) (rs : List (Vote P)) : numer p rs ≤ denom p rs := by
  apply List.countP_mono_left
  intro r _ h
  simp only [Bool.and_eq_true] at *
  exact ⟨h.1, numerPred_le_denomPred r h.2⟩

/-- **(a) The ratio is a proportion.** When the denominator is positive, Equation 1 lies
in `[0, 1]`. -/
theorem alignment_mem_unit (p : P) (rs : List (Vote P)) (hpos : 0 < denom p rs) :
    0 ≤ alignment p rs ∧ alignment p rs ≤ 1 := by
  have hd : (0 : Rat) < (denom p rs : Rat) := by
    simpa using (Rat.natCast_lt_natCast.mpr hpos)
  have hle : (numer p rs : Rat) ≤ (denom p rs : Rat) :=
    Rat.natCast_le_natCast.mpr (numer_le_denom p rs)
  have hnn : (0 : Rat) ≤ (numer p rs : Rat) := by
    simpa using (Rat.natCast_le_natCast.mpr (Nat.zero_le (numer p rs)))
  unfold alignment
  constructor
  · rw [← Rat.not_lt, Rat.div_lt_iff hd, Rat.zero_mul, Rat.not_lt]
    exact hnn
  · rw [← Rat.not_lt, Rat.lt_div_iff hd, Rat.one_mul, Rat.not_lt]
    exact hle

/-! ## (b) order does not matter -/

/-- **(b)** The numerator does not depend on the order of the records. -/
theorem numer_perm (p : P) {rs rs' : List (Vote P)} (h : rs.Perm rs') :
    numer p rs = numer p rs' :=
  h.countP_eq _

/-- **(b)** The denominator does not depend on the order of the records. -/
theorem denom_perm (p : P) {rs rs' : List (Vote P)} (h : rs.Perm rs') :
    denom p rs = denom p rs' :=
  h.countP_eq _

/-! ## (c) records outside `V` are ignored -/

/-- Keep only the records whose position is in `V`. -/
def keepV (rs : List (Vote P)) : List (Vote P) := rs.filter fun r => r.vote.inV

/-- **(c)** Dropping every record whose position is outside `V` leaves the numerator
unchanged. -/
theorem numer_filter_V (p : P) (rs : List (Vote P)) : numer p (keepV rs) = numer p rs := by
  unfold numer keepV
  rw [List.countP_filter]
  apply List.countP_congr
  intro r _
  have := numerPred_le_denomPred r
  simp only [denomPred, Bool.and_eq_true] at this ⊢
  constructor
  · intro h; exact h.1
  · intro h; exact ⟨h, (this h.2).2⟩

/-- **(c)** Dropping every record whose position is outside `V` leaves the denominator
unchanged. -/
theorem denom_filter_V (p : P) (rs : List (Vote P)) : denom p (keepV rs) = denom p rs := by
  unfold denom keepV
  rw [List.countP_filter]
  apply List.countP_congr
  intro r _
  simp only [denomPred, Bool.and_eq_true]
  constructor
  · intro h; exact h.1
  · intro h; exact ⟨h, h.2.2⟩

/-- **(b)+(c)** If two record lists contain the same records with positions in `V`, up to
order, they have the same numerator and the same denominator for every party, however
many absences or Art. 17 records either contains. -/
theorem counts_eq_of_perm_filter_V (p : P) {rs rs' : List (Vote P)}
    (h : (keepV rs).Perm (keepV rs')) :
    numer p rs = numer p rs' ∧ denom p rs = denom p rs' := by
  constructor
  · rw [← numer_filter_V p rs, ← numer_filter_V p rs']; exact numer_perm p h
  · rw [← denom_filter_V p rs, ← denom_filter_V p rs']; exact denom_perm p h

omit [DecidableEq P] in
theorem keepV_eq_nil {extra : List (Vote P)} (h : ∀ r ∈ extra, r.vote.inV = false) :
    keepV extra = [] := by
  unfold keepV
  rw [List.filter_eq_nil_iff]
  intro r hr
  simp [h r hr]

/-- **(c)** Inserting records outside `V` anywhere in the input leaves the numerator
unchanged. -/
theorem numer_append_outside_V (p : P) (rs₁ rs₂ extra : List (Vote P))
    (h : ∀ r ∈ extra, r.vote.inV = false) :
    numer p (rs₁ ++ extra ++ rs₂) = numer p (rs₁ ++ rs₂) := by
  have := (counts_eq_of_perm_filter_V p (rs := rs₁ ++ extra ++ rs₂) (rs' := rs₁ ++ rs₂)
    (by simp [keepV, List.filter_append] at *; rw [show extra.filter _ = [] from keepV_eq_nil h]; simp)).1
  exact this

/-- **(c)** Inserting records outside `V` anywhere in the input leaves the denominator
unchanged. -/
theorem denom_append_outside_V (p : P) (rs₁ rs₂ extra : List (Vote P))
    (h : ∀ r ∈ extra, r.vote.inV = false) :
    denom p (rs₁ ++ extra ++ rs₂) = denom p (rs₁ ++ rs₂) := by
  have := (counts_eq_of_perm_filter_V p (rs := rs₁ ++ extra ++ rs₂) (rs' := rs₁ ++ rs₂)
    (by simp [keepV, List.filter_append] at *; rw [show extra.filter _ = [] from keepV_eq_nil h]; simp)).2
  exact this

/-! ## (d) the counts partition the votes -/

/-- Counting a disjunction of two disjoint predicates adds the counts. -/
theorem countP_or_of_disjoint {α : Type _} (a b : α → Bool) (hab : ∀ x, ¬ (a x ∧ b x)) :
    ∀ l : List α, l.countP (fun x => a x || b x) = l.countP a + l.countP b
  | [] => rfl
  | x :: l => by
    simp only [List.countP_cons, countP_or_of_disjoint a b hab l]
    have := hab x
    cases ha : a x <;> cases hb : b x <;> simp_all <;> omega

/-- Summing per-party counts over a duplicate-free list of parties counts the records
whose party is in the list. -/
theorem sum_countP_party (q : Vote P → Bool) (rs : List (Vote P)) :
    ∀ ps : List P, ps.Nodup →
      (ps.map fun p => rs.countP fun r => decide (r.party = p) && q r).sum =
        rs.countP fun r => decide (r.party ∈ ps) && q r
  | [], _ => by simp
  | p :: ps, hnd => by
    rw [List.nodup_cons] at hnd
    rw [List.map_cons, List.sum_cons, sum_countP_party q rs ps hnd.2,
      ← countP_or_of_disjoint]
    · apply List.countP_congr
      intro r _
      simp only [List.mem_cons, Bool.or_eq_true, Bool.and_eq_true, decide_eq_true_eq]
      rw [or_and_right]
    · intro r ⟨h1, h2⟩
      simp only [Bool.and_eq_true, decide_eq_true_eq] at h1 h2
      exact hnd.1 (h1.1 ▸ h2.1)

/-- If the parties cover every record, the party condition is vacuous. -/
theorem countP_party_cover (q : Vote P → Bool) (rs : List (Vote P)) (ps : List P)
    (hcov : ∀ r ∈ rs, r.party ∈ ps) :
    (rs.countP fun r => decide (r.party ∈ ps) && q r) = rs.countP q := by
  apply List.countP_congr
  intro r hr
  simp [hcov r hr]

/-- **(d) Denominators partition the votes.** For a duplicate-free list of parties that
contains the party of every record, the denominators summed over the parties equal the
number of votes in `V` in votings oriented Sim or Não. -/
theorem sum_denom (rs : List (Vote P)) (ps : List P) (hnd : ps.Nodup)
    (hcov : ∀ r ∈ rs, r.party ∈ ps) :
    (ps.map fun p => denom p rs).sum = rs.countP denomPred := by
  unfold denom
  rw [sum_countP_party _ rs ps hnd, countP_party_cover _ rs ps hcov]

/-- **(d) Numerators partition the agreeing votes.** Same statement for numerators: they
sum to the number of votes equal to the orientation. -/
theorem sum_numer (rs : List (Vote P)) (ps : List P) (hnd : ps.Nodup)
    (hcov : ∀ r ∈ rs, r.party ∈ ps) :
    (ps.map fun p => numer p rs).sum = rs.countP numerPred := by
  unfold numer
  rw [sum_countP_party _ rs ps hnd, countP_party_cover _ rs ps hcov]

end PaperProofs.Alignment
