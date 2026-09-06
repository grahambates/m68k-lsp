import type { Rule } from "../core/rule.js";
import { nullBranch } from "./optimization/null-branch.js";
import { preferAddq } from "./optimization/prefer-addq.js";
import { preferMoveq } from "./optimization/prefer-moveq.js";
import { redundantLea } from "./optimization/redundant-lea.js";
import { preferSubq } from "./optimization/prefer-subq.js";
import { preferSubqForNegativeAdd, preferAddqForNegativeSub } from "./optimization/quick-negative.js";
import { preferNot } from "./optimization/prefer-not.js";
import { preferTstZero } from "./optimization/prefer-tst-zero.js";
import { preferBset, preferBclr } from "./optimization/prefer-bit-op.js";
import { shiftToClear } from "./optimization/shift-to-clear.js";
import { selfMove } from "./suspicious/self-move.js";
import { suspiciousNop } from "./suspicious/nop.js";
import { staleConditionCode } from "./correctness/stale-condition-code.js";
import { zeroSizedStorage } from "./suspicious/zero-sized-storage.js";
import { conditionAfterPreservedCcr } from "./suspicious/condition-after-preserved-ccr.js";
import { moveaWordSignExtension } from "./suspicious/movea-word-sign-extension.js";
import { bitNumberWraparound } from "./suspicious/bit-number-wraparound.js";
import { partialRegisterWrite } from "./suspicious/partial-register-write.js";
import { unexpectedAbsoluteAddress } from "./suspicious/unexpected-absolute-address.js";
import { requireInstructionSize, omitRedundantInstructionSize } from "./style/instruction-size-style.js";
import {
  preferAddressRegisterMnemonics,
  preferDbraAlias,
  preferDbfAlias,
  preferUnsignedConditionAliases,
  preferCarryConditionAliases,
} from "./style/semantic-mnemonic-style.js";
import { preferLeaQuick } from "./optimization/prefer-lea-quick.js";
import { jsrRtsTailCall, bsrRtsTailCall } from "./optimization/tail-call.js";
import { pushAddressPea } from "./optimization/push-address-pea.js";
import { preferMoveqZero } from "./optimization/prefer-moveq-zero.js";
import { preferStMinusOne } from "./optimization/prefer-st-minus-one.js";
import { preferAddForShiftOne } from "./optimization/prefer-add-for-shift-one.js";
import { preferMoveWordAddress } from "./optimization/prefer-move-word-address.js";
import { zeroAddressRegister } from "./optimization/zero-address-register.js";
import { addqAddressWordSize, subqAddressWordSize } from "./optimization/quick-address-word-size.js";
import { preferUnlkSequence } from "./optimization/unlk-sequence.js";
import { preferLinkSequence } from "./optimization/link-sequence.js";
import { btstSignBranch } from "./optimization/btst-sign-branch.js";
import { combineAdjacentClrBytes, combineAdjacentClrWords } from "./optimization/adjacent-clear.js";
import { combineAdjacentMoveBytes, combineAdjacentMoveWords } from "./optimization/adjacent-immediate-move.js";
import { redundantZeroDisplacement } from "./optimization/redundant-zero-displacement.js";
import { addressAddToLea, addressSubToLea } from "./optimization/address-immediate-lea.js";
import { pushImmediatePea } from "./optimization/push-immediate-pea.js";
import { singleRegisterMovem } from "./optimization/single-register-movem.js";
import { bsetLowWordMask, bclrLowWordMask } from "./optimization/bit-op-low-word.js";
import { shiftTwoAdds } from "./optimization/shift-two-adds.js";

import { knownZeroClear } from "./optimization/known-zero-clear.js";
import { moveImmediateViaScratch } from "./optimization/move-immediate-via-scratch.js";
import { cmpZeroAddressViaScratch } from "./optimization/cmp-zero-address-via-scratch.js";
import { combineConsecutiveAddq } from "./optimization/combine-addq.js";
import {
  multiplyWordByZero,
  multiplySignedWordByOne,
  multiplyUnsignedWordByOne,
  multiplySignedWordPowerOfTwo,
  multiplyUnsignedWordPowerOfTwo,
  multiplySignedWordHighPowerOfTwo,
  multiplyUnsignedWordHighPowerOfTwo,
} from "./optimization/multiply-simple.js";
import {
  negateThenSubToAdd,
  negateThenAddToSub,
  negateAddPowerOfTwoToEor,
} from "./optimization/negate-arithmetic-pair.js";
import {
  moveImmediateBelowMoveq,
  moveImmediateByteComplement,
  moveImmediateDoubleByte,
} from "./optimization/move-immediate-synthesis.js";
import { cancelAddqPredecrementMove } from "./optimization/cancel-predecrement.js";
import { zeroArithmeticToTst } from "./optimization/zero-arithmetic-to-tst.js";
import { combineExtByte } from "./optimization/combine-ext-byte.js";

import { redundantTst } from "./optimization/redundant-tst.js";
import { bsetToTas } from "./optimization/bset-to-tas.js";
import { leaZeroAddress } from "./optimization/lea-zero-address.js";
import { moveImmediateWordComplement, moveImmediateSwap } from "./optimization/move-immediate-more-synthesis.js";
import { longShiftSequence } from "./optimization/long-shift-sequences.js";
import { moveImmediateAddressToLea, moveAddressThenAddToLea } from "./optimization/movea-lea.js";
import { atariTrapStackCleanup } from "./platform/atari/trap-stack-cleanup.js";
import { amigaBitMaskConstants } from "./platform/amiga/bit-mask-constants.js";
import { movemRestoreMismatch } from "./suspicious/movem-restore-mismatch.js";
import { cancelMultiplePredecrementMoves } from "./optimization/cancel-multiple-predecrement.js";
import { cancelStackPeaSequence } from "./optimization/stack-pea-cancellation.js";
import { multiplyLongByOne } from "./optimization/multiply-long-by-one.js";
import {
  multiplyLongSmallConstant,
  multiplyLongLargePowerOfTwo,
  multiplySignedLong060,
} from "./optimization/multiply-long-constants.js";
import { cmpaZeroToTst030 } from "./optimization/cmpa-zero-tst-030.js";
import { multiplySignedWordSelectedConstants } from "./optimization/multiply-word-constants.js";
import { foldAddressExpressionToLea } from "./optimization/address-expression-lea.js";
import { divuWordPowerOfTwo, divuLongPowerOfTwo } from "./optimization/divu-power-of-two.js";
import {
  narrowMoveaImmediate,
  narrowAddaSubaImmediate,
  narrowCmpaImmediate,
} from "./optimization/flamewing-address-width.js";
import { simplifyLongWordMasks } from "./optimization/flamewing-masks.js";
import { normalizeByteRotate } from "./optimization/flamewing-rotates.js";
import { simplifyKnownRegisterRotate, roxlToAddx, lslByteSeven } from "./optimization/flamewing-rotate-sequences.js";
import {
  knownRegisterShiftToClear,
  lsrByteSeven,
  asrByteSaturate,
  knownRegisterShiftReduction,
  knownRegisterAsrWordLowOnly,
  knownRegisterAsrLongHighReduction,
  knownRegisterAsrSaturate,
} from "./optimization/flamewing-shifts.js";
import { foldAddressArithmeticToIndexedLea } from "./optimization/flamewing-address-sequences.js";
import {
  flamewingMulsWordFullResultConstants,
  flamewingMulsWordLowWordOnly,
  flamewingMuluWordLowWordOnly,
} from "./optimization/flamewing-multiply.js";
import { moveByteAndMaskViaMoveq } from "./optimization/flamewing-partial-register.js";
import { andAllOnesToTst, orZeroToTst, eorZeroToTst } from "./optimization/vasm-logical-identities.js";
import {
  compareLongImmediateViaMoveq,
  destructiveSmallCompareBranch,
  jsrJmpDispatch,
} from "./optimization/tricks-and-traps.js";
import {
  stackAlignedWordShiftByEight,
  stackAlignedKnownRegisterShifts,
} from "./optimization/flamewing-stack-shifts.js";
import { vasmNegativeSignedMultiply } from "./optimization/vasm-negative-multiply.js";
import { amigaTasUnsupported } from "./platform/amiga/tas.js";
import { amigaCustomRegisterAccess } from "./platform/amiga/custom-register-access.js";

export {
  amigaTasUnsupported,
  amigaCustomRegisterAccess,
  vasmNegativeSignedMultiply,
  stackAlignedWordShiftByEight,
  stackAlignedKnownRegisterShifts,
  nullBranch,
  preferAddq,
  preferMoveq,
  redundantLea,
  preferSubq,
  preferSubqForNegativeAdd,
  preferAddqForNegativeSub,
  preferNot,
  preferTstZero,
  preferBset,
  preferBclr,
  shiftToClear,
  selfMove,
  suspiciousNop,
  staleConditionCode,
  zeroSizedStorage,
  conditionAfterPreservedCcr,
  moveaWordSignExtension,
  bitNumberWraparound,
  partialRegisterWrite,
  unexpectedAbsoluteAddress,
  atariTrapStackCleanup,
  amigaBitMaskConstants,
  movemRestoreMismatch,
  requireInstructionSize,
  omitRedundantInstructionSize,
  preferAddressRegisterMnemonics,
  preferDbraAlias,
  preferDbfAlias,
  preferUnsignedConditionAliases,
  preferCarryConditionAliases,
  preferLeaQuick,
  jsrRtsTailCall,
  bsrRtsTailCall,
  pushAddressPea,
  preferMoveqZero,
  preferStMinusOne,
  preferAddForShiftOne,
  preferMoveWordAddress,
  zeroAddressRegister,
  addqAddressWordSize,
  subqAddressWordSize,
  preferUnlkSequence,
  preferLinkSequence,
  btstSignBranch,
  combineAdjacentClrBytes,
  combineAdjacentClrWords,
  combineAdjacentMoveBytes,
  combineAdjacentMoveWords,
  redundantZeroDisplacement,
  addressAddToLea,
  addressSubToLea,
  pushImmediatePea,
  singleRegisterMovem,
  bsetLowWordMask,
  bclrLowWordMask,
  shiftTwoAdds,
  knownZeroClear,
  moveImmediateViaScratch,
  cmpZeroAddressViaScratch,
  combineConsecutiveAddq,
  multiplyWordByZero,
  multiplySignedWordByOne,
  multiplyUnsignedWordByOne,
  multiplySignedWordPowerOfTwo,
  multiplyUnsignedWordPowerOfTwo,
  multiplySignedWordHighPowerOfTwo,
  multiplyUnsignedWordHighPowerOfTwo,
  negateThenSubToAdd,
  negateThenAddToSub,
  negateAddPowerOfTwoToEor,
  moveImmediateBelowMoveq,
  moveImmediateByteComplement,
  moveImmediateDoubleByte,
  moveImmediateWordComplement,
  moveImmediateSwap,
  cancelAddqPredecrementMove,
  zeroArithmeticToTst,
  combineExtByte,
  redundantTst,
  bsetToTas,
  leaZeroAddress,
  longShiftSequence,
  moveImmediateAddressToLea,
  moveAddressThenAddToLea,
  cancelMultiplePredecrementMoves,
  cancelStackPeaSequence,
  multiplyLongByOne,
  multiplyLongSmallConstant,
  multiplyLongLargePowerOfTwo,
  multiplySignedLong060,
  cmpaZeroToTst030,
  multiplySignedWordSelectedConstants,
  foldAddressExpressionToLea,
  divuWordPowerOfTwo,
  divuLongPowerOfTwo,
  narrowMoveaImmediate,
  narrowAddaSubaImmediate,
  simplifyLongWordMasks,
  normalizeByteRotate,
  simplifyKnownRegisterRotate,
  roxlToAddx,
  lslByteSeven,
  knownRegisterShiftToClear,
  lsrByteSeven,
  asrByteSaturate,
  knownRegisterShiftReduction,
  knownRegisterAsrWordLowOnly,
  knownRegisterAsrLongHighReduction,
  knownRegisterAsrSaturate,
  foldAddressArithmeticToIndexedLea,
  flamewingMulsWordFullResultConstants,
  flamewingMulsWordLowWordOnly,
  flamewingMuluWordLowWordOnly,
  narrowCmpaImmediate,
  andAllOnesToTst,
  orZeroToTst,
  eorZeroToTst,
};

export const defaultRules: readonly Rule[] = [
  preferCarryConditionAliases,
  preferUnsignedConditionAliases,
  preferDbfAlias,
  preferDbraAlias,
  preferAddressRegisterMnemonics,
  requireInstructionSize,
  omitRedundantInstructionSize,
  amigaTasUnsupported,
  amigaCustomRegisterAccess,
  vasmNegativeSignedMultiply,
  stackAlignedKnownRegisterShifts,
  stackAlignedWordShiftByEight,
  compareLongImmediateViaMoveq,
  destructiveSmallCompareBranch,
  jsrJmpDispatch,
  andAllOnesToTst,
  orZeroToTst,
  eorZeroToTst,
  narrowCmpaImmediate,
  moveByteAndMaskViaMoveq,
  narrowMoveaImmediate,
  narrowAddaSubaImmediate,
  simplifyLongWordMasks,
  normalizeByteRotate,
  simplifyKnownRegisterRotate,
  roxlToAddx,
  lslByteSeven,
  knownRegisterShiftToClear,
  lsrByteSeven,
  asrByteSaturate,
  knownRegisterShiftReduction,
  knownRegisterAsrWordLowOnly,
  knownRegisterAsrLongHighReduction,
  knownRegisterAsrSaturate,
  foldAddressArithmeticToIndexedLea,
  flamewingMulsWordFullResultConstants,
  flamewingMulsWordLowWordOnly,
  flamewingMuluWordLowWordOnly,
  divuLongPowerOfTwo,
  foldAddressExpressionToLea,
  divuWordPowerOfTwo,
  multiplySignedWordSelectedConstants,
  cmpaZeroToTst030,
  multiplySignedLong060,
  multiplyLongLargePowerOfTwo,
  multiplyLongSmallConstant,
  cancelStackPeaSequence,
  multiplyLongByOne,
  redundantTst,
  bsetToTas,
  leaZeroAddress,
  longShiftSequence,
  moveImmediateAddressToLea,
  moveAddressThenAddToLea,
  cancelMultiplePredecrementMoves,
  moveImmediateWordComplement,
  moveImmediateSwap,
  combineExtByte,
  zeroArithmeticToTst,
  cancelAddqPredecrementMove,
  moveImmediateBelowMoveq,
  moveImmediateByteComplement,
  moveImmediateDoubleByte,
  negateAddPowerOfTwoToEor,
  negateThenSubToAdd,
  negateThenAddToSub,
  multiplyUnsignedWordPowerOfTwo,
  multiplySignedWordHighPowerOfTwo,
  multiplyUnsignedWordHighPowerOfTwo,
  multiplyWordByZero,
  multiplySignedWordByOne,
  multiplyUnsignedWordByOne,
  multiplySignedWordPowerOfTwo,
  knownZeroClear,
  cmpZeroAddressViaScratch,
  combineConsecutiveAddq,
  moveImmediateViaScratch,
  redundantZeroDisplacement,
  addressAddToLea,
  addressSubToLea,
  pushImmediatePea,
  singleRegisterMovem,
  bsetLowWordMask,
  bclrLowWordMask,
  shiftTwoAdds,
  preferMoveq,
  preferMoveqZero,
  preferMoveWordAddress,
  zeroAddressRegister,
  preferAddq,
  addqAddressWordSize,
  preferSubq,
  subqAddressWordSize,
  preferSubqForNegativeAdd,
  preferAddqForNegativeSub,
  preferNot,
  preferStMinusOne,
  preferAddForShiftOne,
  preferTstZero,
  btstSignBranch,
  preferBset,
  preferBclr,
  shiftToClear,
  preferLeaQuick,
  pushAddressPea,
  preferLinkSequence,
  preferUnlkSequence,
  combineAdjacentClrBytes,
  combineAdjacentClrWords,
  combineAdjacentMoveBytes,
  combineAdjacentMoveWords,
  jsrRtsTailCall,
  bsrRtsTailCall,
  redundantLea,
  nullBranch,
  zeroSizedStorage,
  conditionAfterPreservedCcr,
  moveaWordSignExtension,
  bitNumberWraparound,
  partialRegisterWrite,
  unexpectedAbsoluteAddress,
  atariTrapStackCleanup,
  amigaBitMaskConstants,
  movemRestoreMismatch,
  selfMove,
  suspiciousNop,
  staleConditionCode,
];
