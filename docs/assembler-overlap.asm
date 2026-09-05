* Proposals from docs/rule-roadmap.md whose overlap with the assembler is
* unverified. Assemble this and drop any rule the assembler already diagnoses:
*
*   vasmm68k_mot -m68000 -Fbin -o /dev/null docs/assembler-overlap.asm
*
* For reference, `moveq #$ff,d0` was dropped from the roadmap because vasm
* already warns 2028 on it.

	section	code,code

* correctness/divide-by-zero-immediate
	divu	#0,d0
	divs	#0,d1

* correctness/odd-address-word-access
	move.w	$1001,d0
	move.l	$1003,d1

* portability/movem-predecrement-base-in-list
	movem.l	d0-d3/a0,-(a0)
	movem.l	(a1)+,d0-d3/a1

	rts
