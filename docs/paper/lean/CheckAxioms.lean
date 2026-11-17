import PaperProofs

/-! Prints the axioms every main theorem depends on. Run with `lake env lean CheckAxioms.lean`. -/

open PaperProofs

#print axioms Commitment.content_address_collision
#print axioms Commitment.manifest_collision
#print axioms Commitment.manifest_name_determines_artifacts
#print axioms HashChain.chain_collision_same_length
#print axioms HashChain.chain_collision_or_preimage
#print axioms HashChain.chain_collision_of_not_in_range
#print axioms HashChain.chain_extension_counterexample
#print axioms Timestamp.run_collision
#print axioms Timestamp.run_collision_single
#print axioms Alignment.numer_le_denom
#print axioms Alignment.alignment_mem_unit
#print axioms Alignment.numer_perm
#print axioms Alignment.denom_perm
#print axioms Alignment.numer_filter_V
#print axioms Alignment.denom_filter_V
#print axioms Alignment.counts_eq_of_perm_filter_V
#print axioms Alignment.numer_append_outside_V
#print axioms Alignment.denom_append_outside_V
#print axioms Alignment.sum_denom
#print axioms Alignment.sum_numer
#print axioms Score.sortById_eq_of_perm
#print axioms Score.score_independent_of_order
#print axioms Score.score_independent_of_order_nat
#print axioms Score.sortById_needs_unique_ids
