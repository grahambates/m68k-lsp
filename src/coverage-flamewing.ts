export type FlamewingAuditStatus = "implemented" | "duplicate" | "deferred" | "rejected" | "needs-audit";

export interface FlamewingAuditEntry {
  section: string;
  pattern: string;
  status: FlamewingAuditStatus;
  ruleId?: string;
  note?: string;
}

/**
 * Audited subset of Flamewing's M68000 peephole list.
 * This is intentionally independent of ASP68K coverage: the source is treated
 * as a candidate corpus, not an authority, and every row must be verified.
 */
export const flamewingAudit: readonly FlamewingAuditEntry[] = [
  { section: "General", pattern: "CLR.L Dn -> MOVEQ #0,Dn", status: "duplicate", ruleId: "optimization/prefer-moveq-zero" },
  { section: "General", pattern: "ANDI.L #$FFFF,Dn -> SWAP/CLR.W/SWAP", status: "implemented", ruleId: "optimization/simplify-long-word-mask", note: "Value-equivalent; CCR-sensitive." },
  { section: "General", pattern: "ANDI.L #$FFFF0000,Dn -> CLR.W Dn", status: "implemented", ruleId: "optimization/simplify-long-word-mask", note: "Value-equivalent; CCR-sensitive." },
  { section: "Address Register Manipulations", pattern: "MOVEA.L #0,An -> SUBA.L An,An", status: "duplicate", ruleId: "optimization/zero-address-register" },
  { section: "Address Register Manipulations", pattern: "MOVEA.L #val,An -> MOVEA.W #val,An", status: "implemented", ruleId: "optimization/narrow-movea-immediate-word", note: "Verified for signed 16-bit values. Source's claimed 4-byte saving appears incorrect; encoding delta is 2 bytes." },
  { section: "Address Register Manipulations", pattern: "ADDA.L #val,An -> ADDA.W #val,An", status: "implemented", ruleId: "optimization/narrow-address-immediate-word", note: "Verified for signed 16-bit values." },
  { section: "Address Register Manipulations", pattern: "SUBA.L #val,An -> SUBA.W #val,An", status: "implemented", ruleId: "optimization/narrow-address-immediate-word", note: "Symmetric verified form." },
  { section: "Address Register Manipulations", pattern: "ADDA.W/SUBA.W immediate -> ADDQ/SUBQ/LEA", status: "duplicate", note: "Covered by existing quick/address LEA rules through semantic mnemonic normalization." },
  { section: "Address Register Manipulations", pattern: "ADDA/SUBA.W #disp,An + ADDA.S Xn,An -> LEA disp(An,Xn.S),An", status: "implemented", ruleId: "optimization/address-arithmetic-indexed-lea", note: "Verified for signed 8-bit brief-index displacement; rejects Xn=An because the original second instruction would observe the updated An." },
  { section: "Rotates", pattern: "ROL.B #5..7,Dn <-> ROR.B #3..1,Dn", status: "implemented", ruleId: "optimization/normalize-byte-rotate-direction", note: "Value-equivalent; source explicitly warns flags differ." },
  { section: "Logical Shifts", pattern: "LSL/ASL #1 -> ADD Dn,Dn", status: "duplicate", ruleId: "optimization/prefer-add-for-shift-one" },
  { section: "Logical Shifts", pattern: "large immediate shifts -> CLR/word+SWAP sequences", status: "duplicate", note: "Substantially covered by existing shift-to-clear and long-shift rules." },
  { section: "Multiplication by constants", pattern: "MULS.W full-result factors already in ASP68K subset (0..10 selected, 12, powers of two)", status: "duplicate", note: "Covered by existing ASP68K-derived multiply rules." },
  { section: "Multiplication by constants", pattern: "MULS.W #11,#13..26,#29..31,#33..35 full 32-bit result", status: "implemented", ruleId: "optimization/muls-word-full-result-constants", note: "Each recipe independently checked as an integer coefficient identity after EXT.L; requires dead scratch and CCR safety." },
  { section: "Multiplication by constants", pattern: "MULS.W low-word-only factors #3,#5,#7,#9,#15,#17,#31", status: "implemented", ruleId: "optimization/muls-word-low-word-only", note: "Enabled only when upper-word use analysis proves the result high word is discarded; dead scratch and CCR safety still required." },
  { section: "Multiplication by constants", pattern: "MULU.W recipes that place the result in dM", status: "deferred", note: "Source changes the architectural result register; needs value-use substitution analysis before this is a safe lint suggestion." },
  { section: "Division by constants", pattern: "DIVU.W powers of two", status: "duplicate", ruleId: "optimization/divu-word-power-of-two", note: "Existing rule additionally analyses upper-word remainder use." },
  { section: "Rotates", pattern: "MOVEQ #8..15,Dm + ROL/ROR.W Dm,Dn -> opposite immediate rotate", status: "implemented", ruleId: "optimization/known-register-rotate", note: "Verified value equivalence; count register must be dead or already hold the same constant; C is CCR-sensitive." },
  { section: "Rotates", pattern: "MOVEQ #9..31,Dm + ROL/ROR.L Dm,Dn -> SWAP/immediate rotate forms", status: "implemented", ruleId: "optimization/known-register-rotate", note: "Verified by modular 32-bit rotation identities; count-register side effect checked." },
  { section: "Rotates", pattern: "ROXL.B/W #1..2,Dn -> ADDX sequence; ROXL.L #1,Dn -> ADDX.L", status: "implemented", ruleId: "optimization/roxl-to-addx", note: "Verified data path and final X/C/N; V and cumulative-Z semantics differ." },
  { section: "Logical Shifts", pattern: "LSL.B #7,Dn -> ROR.B #1,Dn + ANDI.B #$80,Dn", status: "implemented", ruleId: "optimization/lsl-byte-seven", note: "Verified byte result; speed-for-size tradeoff; X/C differ." },
  { section: "Logical Shifts", pattern: "known register-count LSL/ASL/LSR >= operand width -> CLR/MOVEQ #0", status: "implemented", ruleId: "optimization/known-register-shift-to-clear", note: "Verified for effective 68000 counts 1..63; count-register setup is only removed when its value is disposable." },
  { section: "Logical Shifts", pattern: "LSR.B #7,Dn -> ADD.B/SUBX.B/NEG.B", status: "implemented", ruleId: "optimization/lsr-byte-seven", note: "Verified byte result; X/C differ; speed-for-size tradeoff." },
  { section: "Arithmetic Shifts", pattern: "ASR.B #7/#8,Dn -> ADD.B/SUBX.B", status: "implemented", ruleId: "optimization/asr-byte-saturate", note: "Verified byte saturation result; CCR-sensitive because SUBX has cumulative-Z semantics." },
  { section: "Arithmetic Shifts", pattern: "MOVEQ #15..63,Dm + ASR.W Dm,Dn -> ADD.W/SUBX.W; MOVEQ #31..63 + ASR.L -> ADD.L/SUBX.L", status: "implemented", ruleId: "optimization/known-register-asr-saturate", note: "Exact sign-saturation identity; requires disposable count setup and CCR safety." },
  { section: "Logical Shifts", pattern: "MOVEQ #10..15,Dm + LSL/ASL/LSR.W Dm,Dn -> rotate/mask sequence", status: "implemented", ruleId: "optimization/known-register-shift-reduction", note: "Word identities exhaustively verified over all 65536 input values; LSR form is used for counts 10..14; count setup and CCR side effects checked." },
  { section: "Logical/Arithmetic Shifts", pattern: "MOVEQ #16..23,Dm + LSL/ASL/LSR/ASR.L Dm,Dn -> word/SWAP sequence", status: "implemented", ruleId: "optimization/known-register-shift-reduction", note: "Reuses independently verified immediate-count identities; count setup removed only when its register value is disposable; CCR-sensitive." },
  { section: "Logical Shifts", pattern: "LSL.W #8,Dn / LSR.W #8,Dn via A7 byte-stack alignment", status: "implemented", ruleId: "optimization/stack-word-shift-eight", note: "Exact word-result identity on 68000. SP is restored and only 2 temporary bytes are used; stack memory/bus-fault observability is reported as a conditional side effect." },
  { section: "Logical/Arithmetic Shifts", pattern: "stack-assisted MOVEQ #9 + LSL/ASL.W; #24/#25 LSL/ASL.L; #24 LSR.L/ASR.L", status: "implemented", ruleId: "optimization/stack-known-register-shift", note: "Re-audited after allowing bounded SP scratch. Each uses only 2 temporary bytes, restores SP exactly, and reports stack-memory observability explicitly." },
  { section: "General", pattern: "MOVE.B <ea>,Dn + ANDI.B #mask,Dn -> MOVEQ/AND", status: "implemented", ruleId: "optimization/move-byte-and-mask", note: "Enabled only when bits 8-31 are proven unobserved; rejects source EAs which read Dn because MOVEQ would change the re-evaluated EA." },
  { section: "Logical Shifts", pattern: "MOVEQ #26..31,Dm + LSL/ASL.L Dm,Dn and #25..30 + LSR.L -> rotate/mask/SWAP forms", status: "implemented", ruleId: "optimization/known-register-shift-reduction", note: "Non-stack high-count forms independently verified; count setup must be disposable and CCR differences unobserved for safe application." },
  { section: "Arithmetic Shifts", pattern: "MOVEQ #10..14,Dm + ASR.W Dm,Dn -> EXT.L/SWAP/ROL.L when high word is irrelevant", status: "implemented", ruleId: "optimization/known-register-asr-word-low-only", note: "Low-word identity exhaustively verified across all 65536 word inputs; only enabled when bits 16-31 of Dn are proven unobserved. Flamewing explicitly notes the high word differs." },
  { section: "Arithmetic Shifts", pattern: "MOVEQ #26..30,Dm + ASR.L Dm,Dn -> SWAP/EXT/SWAP/ROL/EXT", status: "implemented", ruleId: "optimization/known-register-asr-long-high", note: "Full 32-bit identity independently verified; non-stack form; count setup and CCR side effects checked." },
];

export function flamewingAuditSummary() {
  const counts: Record<FlamewingAuditStatus, number> = { implemented: 0, duplicate: 0, deferred: 0, rejected: 0, "needs-audit": 0 };
  for (const entry of flamewingAudit) counts[entry.status] += 1;
  return { total: flamewingAudit.length, ...counts };
}
