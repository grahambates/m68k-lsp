             INCDIR      "include"
             INCLUDE     "PhotonsMiniWrapper1.04!.i"

********************************************************************************
* Constants:
********************************************************************************

             INCLUDE     "defs.i"

; Flags:
INTF      = INTF_SETCLR|INTF_INTEN|INTF_VERTB
DMAF      = DMAF_SETCLR|DMAF_BLITHOG|DMAF_MASTER|DMAF_RASTER|DMAF_COPPER|DMAF_BLITTER

; Screen:
BPLS      = 3                                               ; Number of bitplanes
H         = 256                                             ; Lines (256 normal PAL, 272 overscan)
W         = 320                                             ; Pixels (multiple of 16, 320 normal, 352 overscan)
DIW_V     = $2c                                             ; Hardware Vstart ($2c normal, $24 overscan)
ENDLINE   = DIW_V+H                                         ; Safe to starting clearing after this scanline
WWI       = W/16                                            ; Word width
BWI       = WWI*2                                           ; Byte width
BPL_B     = BWI*H                                           ; Bitplane bytes
SCREEN_B  = BPL_B*BPLS                                      ; Screen bytes
IMAGE_MOD = BWI*(BPLS-1)

********************************************************************************
* Macros:
********************************************************************************

WAITBLIT:macro
             tst.w       (a6)                               ;for compatibility with A1000
.wb\@:       btst        #6,2(a6)
             bne.s       .wb\@
             endm

********************************************************************************
* Main entry point:
********************************************************************************

;-------------------------------------------------------------------------------
; a4=VBR, a6=Custom
Demo:
; Init:
             move.l      #VBint,$6c(a4)
             move.w      #INTF,intena(a6)
             move.w      #DMAF,dmacon(a6)                   ; dsf

             lea         Arr,a0
             move.w      #8,d0
             BLO         Sort

             lea         Image,a0
             lea         Screen1,a1
             bsr         CopyImage
             lea         Screen2,a1
             bsr         CopyImage

             lea         Copper1,
             a0
             bsr         CopyCopper
             lea         Copper2,a0
             bsr         CopyCopper

             lea         Screen1,a0
             lea         Copper1,a1
             bsr         PokePtrs
             lea         Screen2,a0
             lea         Copper2,a1
             bsr         PokePtrs

            ;  move.w      #10,d0
            ;  move.w      #48,d1
            ;  move.w      #6,d2
            ;  lea         Screen2,a0
            ;  bsr         ShiftRight

             lea         Screen2,a0

            ;  move.w      #$a1,d0                            ; 161
            ;  move.w      #$bf,d1                            ; 191
            ;  move.w      #1,d2
            ;  bsr         ShiftLeft

            ;  move.w      #$c0,d0
            ;  move.w      #$dc,d1
            ;  move.w      #2,d2
            ;  bsr         ShiftLeft

            ;  move.w      #$de,d0
            ;  move.w      #$108,d1
            ;  move.w      #3,d2
            ;  bsr         ShiftLeft

             move.w      #$10a,d0
             move.w      #$122,d1
             move.w      #4,d2
             bsr         ShiftLeft

             move.w      #$124,d0
             move.w      #$140,d1
             move.w      #5,d2
             bsr         ShiftLeft

.mainLoop:
             move.w      #ENDLINE,d0
             bsr         WaitRaster
             bsr         SwapBuffer
             move.l      ViewCopper,cop1lc(a6)

             move.w      ScaleWidth(pc),d0                  ; d0.w = target width
             add.w       ScaleInc(pc),d0

             cmp.w       #160,d0
             bgt         .notMin
             neg.w       ScaleInc
.notMin
             cmp.w       #320,d0
             blt         .notMax
             neg.w       ScaleInc
.notMax

             move.w      d0,ScaleWidth
            ;  bsr         ScaleH
            ;  move.w      #$000,$180(a6)

             move.l      #H<<6,d1                           ; Scale height proportional to width
             divu        #W,d1
             ext.l       d1
             mulu        d0,d1
             lsr.l       #6,d1
            ;  move.w      d1,ScaleHeight

            ;  move.w      #$ff0,$180(a6)
             bsr         ScaleV

            ;  move.w      #$000,$180(a6)                     ; Show rastertime left down to $12c
             btst        #6,$bfe001                         ; Left mouse button not pressed?
             bne.w       .mainLoop                          ; then loop
.exit        rts

********************************************************************************
* Routines:
********************************************************************************

;-------------------------------------------------------------------------------
; Sort array using Selection Sort argorithm
; a0.l = array
; d0.w = length
Sort:
             movem.l     d0-d3/a0-a2,-(sp)
             subq.w      #2,d0
             blt         .end
.l0:
             move.w      d0,d1
             move.l      a0,a1
             move.w      (a1)+,d2                           ; d2 = lowest value
.l1:
             move.w      (a1),d3
             cmp.w       d2,d3
             bge         .next1
             move.w      d3,d2
             move.l      a1,a2                              ; a2 = ptr to lowest
.next1       addq.l      #2,a1
             dbf         d1,.l1
; Swap lowest with first item if not equal
             cmp.w       (a0),d2
             beq         .next0
             move.w      (a0),(a2)
             move.w      d2,(a0)
.next0       addq.l      #2,a0
             dbf         d0,.l0
.end         movem.l     (sp)+,d0-d3/a0-a2
             rts

;-------------------------------------------------------------------------------
; d1.w = target width
ScaleH:
             movem.l     d0-d4/a0-a3,-(sp)
             move.l      DrawScreen,a0
             move.l      DrawWidth(pc),a1
             move.w      (a1),d1                            ; d1.w = current width
             move.w      d0,(a1)                            ; Update current width

             move.w      #W,d7                              ; d7.w = left offset
             sub.w       d1,d7
             lsr.w       d7

             lea         ColPositionsE(pc),a2
             move.w      d1,d4
             add.w       d4,d4
             ext.l       d4
             sub.l       d4,a2                              ; Offset a2 to current step

             move.w      d0,d3
             sub.w       d1,d3                              ; d3.w = delta
             blt         .scaleDown
; ; Scale up:
;              lea         Image,a1
;              lea         SrcColsE(pc),a3
;              sub.l       d4,a3                              ; Offset a3 to current step
;              move.w      d1,d2
;              bra         .endL0
; .l0          move.w      -(a2),d0
;              move.w      d2,d1
;              bsr         InsertCol
;              move.w      -(a3),d1
;              bsr         CopyCol
;              addq.w      #1,d2
; .endL0       dbf         d3,.l0
;              bra         .exit
.scaleDown:
             neg.w       d3
             move.w      d3,d0                              ; d0.w = array length
             clr.w       d5                                 ; d5.w = Left hand cols count
             lea         Cols,a0
             bra         .endL1
.l1          move.w      (a2)+,d2
             add.w       d7,d2                              ; Add offset
             move.w      d2,(a0)+                           ; Add columns to array for sorting
             cmp.w       #W/2,d2                            ; Count left hand columns
             bge         .endL1
             addq.w      #1,d5
.endL1       dbf         d3,.l1

             lea         Cols,a0                            ; Sort cols array
             bsr         Sort

             move.w      d0,d4                              ; d4.w = Right hand cols count
             sub.w       d5,d4
             move.l      DrawScreen,a0

; LHS:
; Move continuous sections right in increasing increments  - rtl
; | |x| | | |x| | | |x| |        x = to remove
;              --1->             + = space
; | |x| | | |x|+| | | | |
;      --2->
; | |x|+|+| | | | | | | |
; 3->
; |+|+|+| | | | | | | | |
             lea         Cols,a1
             ext.l       d5                                 ; Move to middle of array - iterate first half in reverse
             add.l       d5,a1
             add.l       d5,a1
             move.l      a1,a2
             moveq       #1,d2                              ; d2.w = shift amount
             bra         .endL3
.l3          move.w      -(a1),d1                           ; d1.w = shift 'to' column (col to remove - 1)
             subq.w      #1,d1
             tst.w       d5                                 ; Is there a 'next' value?
             bne         .getNext0
             move.w      d7,d0                              ; d0.w = shift 'from' column (image start)
             bra         .apply0
.getNext0
             move.w      -2(a1),d0                          ; d0.w = shift 'from' column (next col to remove + 1)
             addq.w      #1,d0
.apply0
             bsr         ShiftRight
             addq.w      #1,d2                              ; Increment shift amount
.endL3       dbf         d5,.l3

; RHS:
; Move continuous sections left in increasing increments  - ltr
; | |x| | | |x| | | |x| |        x = to remove
;      <-1--                     + = space
; | | | | |+|x| | | |x| |
;              <-2--
; | | | | | | | |+|+|x| |
;                      <3
; | | | | | | | | |+|+|+|
             move.l      a2,a1
             moveq       #1,d2                              ; d2.w = shift amount
             bra         .endL2
.l2          move.w      (a1)+,d0                           ; d0.w = shift 'from' column (col to remove + 1)
             addq.w      #1,d0
             tst.w       d4                                 ; Is there a 'next' value?
             bne         .getNext1
             move.w      #W,d1                              ; d1.w = shift 'to' column (image end)
             sub.w       d7,d1
             bra         .apply1
.getNext1
             move.w      (a1),d1                            ; d1.w = shift 'to' column (next col to remove - 1)
             subq.w      #1,d1
.apply1
             bsr         ShiftLeft
             addq.w      #1,d2                              ; Increment shift amount
.endL2       dbf         d4,.l2

.exit        movem.l     (sp)+,d0-d4/a0-a3
             rts

; a0
; a1,dc,1
; dd
; de,108,2
; 109
; 10a,140,3

; a0
; a1,be,1
; bf
; c0,dc,2
; dd
; de,108,3
; 109
; 10a,122,4
; 123
; 124,140,5

; a9
; b0,c0,1
; c1
; c2,f0,2
; f1
; f2,111,3
; 112
; 113,124,4
; 125
; 126,13e,5

; b2
; b3,e3,1
; ...

;-------------------------------------------------------------------------------
; Copy one column of image data
; d0.w = dest column index
; d1.w = source column index
; a0.l = dest buffer
; a1.l = source image
CopyCol:
             movem.l     d0-d4/a0-a1,-(sp)
             move.w      d1,d2
             move.w      d0,d3
             lsr.w       #4,d2                              ; d2.w = source word offset
             lsr.w       #4,d3                              ; d3.w = dest word offset
             and.w       #$f,d1                             ; d1.w = source bits remainder
             and.w       #$f,d0                             ; d0.w = dest bits remainder

             ext.l       d2                                 ; Move pointers to blit start:
             ext.l       d3
             add.l       d2,a1
             add.l       d2,a1
             add.l       d3,a0
             add.l       d3,a0

             clr.w       d3                                 ; d3.w = bltafwm
             moveq       #15,d4
             sub.w       d0,d4
             bset        d4,d3

             clr.w       d4                                 ; d4.w = bltcon1
             sub.w       d1,d0                              ; d0.w = B Shift
             bge         .pos
             neg.w       d0                                 ; Reverse for left shift
             moveq       #BLITREVERSE,d4
             add.l       #BWI*BPLS*H-BWI,a1
             add.l       #BWI*BPLS*H-BWI,a0
.pos
             lsl.w       #6,d0                              ; Add B Shift to bltcon1
             lsl.w       #6,d0
             add.w       d0,d4

             WAITBLIT
             move.w      #SRCB!SRCC!DEST!$ca,bltcon0(a6)
             move.w      d4,bltcon1(a6)
             move.l      a1,bltbpt(a6)
             move.l      a0,bltcpt(a6)
             move.l      a0,bltdpt(a6)
             move.w      #BWI-2,bltbmod(a6)
             move.w      #BWI-2,bltcmod(a6)
             move.w      #BWI-2,bltdmod(a6)
             move.w      #$ffff,bltalwm(a6)
             move.w      d3,bltafwm(a6)
             move.w      #$ffff,bltadat(a6)
             move.w      #H*BPLS*64+1,bltsize(a6)
             movem.l     (sp)+,d0-d4/a0-a1
             rts

;-------------------------------------------------------------------------------
; d0.w = start column
; d1.w = end column
; d2.w = shift amount
; a0.l = draw screen
ShiftRight:
             movem.l     d0-a6,-(sp)
             addq.w      #1,d1                              ; make end col inclusive
             add.w       d2,d1

             move.w      d0,d6                              ; d6.w = start word
             lsr.w       #4,d6

             ext.l       d6                                 ; Move ptr to start of blit
             add.l       d6,a0
             add.l       d6,a0

             move.w      d1,d5
             lsr.w       #4,d5
             sub.w       d6,d5
             addq.w      #1,d5                              ; d5.w = word width

             and.w       #$f,d0                             ; d0.w = start bits
             cmp.w       d2,d0
             bge         .ok
             move.w      d2,d0
.ok
             and.w       #$f,d1                             ; d1.w = end bits
             move.w      #$ffff,d3                          ; d3.w = fwm
             move.w      #$ffff,d4                          ; d4.w = lwm
             lsr.w       d0,d3
             lsr.w       d1,d4
             not.w       d4

             move.w      #BWI,d6                            ; d6.w = modulo
             sub.w       d5,d6
             sub.w       d5,d6

             lsl.w       #8,d2                              ; d2.w = bltcon1
             lsl.w       #4,d2                              ; !shift << 12

             add.w       #H*BPLS*64,d5                      ; d5.w = blit size

             WAITBLIT
             move.w      #SRCB!SRCC!DEST!$ca,bltcon0(a6)
             move.w      d2,bltcon1(a6)
             move.l      a0,bltbpt(a6)                      ; Source for shifted data
             move.l      a0,bltcpt(a6)                      ; Original data for masked areas
             move.l      a0,bltdpt(a6)                      ; Destination
             move.w      d6,bltbmod(a6)
             move.w      d6,bltcmod(a6)
             move.w      d6,bltdmod(a6)
             move.w      #$ffff,bltadat(a6)
             move.w      d3,bltafwm(a6)
             move.w      d4,bltalwm(a6)
             move.w      d5,bltsize(a6)

             movem.l     (sp)+,d0-a6
             rts

;-------------------------------------------------------------------------------
; d0.w = start column
; d1.w = end column
; d2.w = shift amount
; a0.l = draw screen
ShiftLeft:
             movem.l     d0-a6,-(sp)
             subq.w      #2,d0                              ; ???
             addq.w      #1,d1                              ; make end col inclusive
             add.w       d2,d0

             move.w      d0,d6                              ; d6.w = start word
             lsr.w       #4,d6

             ext.l       d6                                 ; Move ptr to start of blit
             add.l       d6,a0
             add.l       d6,a0

             move.w      d1,d5
             lsr.w       #4,d5
             sub.w       d6,d5
             addq.w      #1,d5                              ; d5.w = word width

             and.w       #$f,d0                             ; d0.w = start bits
             and.w       #$f,d1                             ; d1.w = end bits
             cmp.w       d2,d1
             bge         .ok
             move.w      d2,d1                              ; ???
.ok
             move.w      #$ffff,d3                          ; d3.w = lwm
             move.w      #$ffff,d4                          ; d4.w = fwm
             lsr.w       d0,d3
             lsr.w       d1,d4
             not.w       d4

             move.w      #BWI,d6                            ; d6.w = modulo
             sub.w       d5,d6
             sub.w       d5,d6

             lsl.w       #8,d2                              ; d2.w = bltcon1
             lsl.w       #4,d2                              ; !shift << 12
             add.w       #BLITREVERSE,d2

             add.l       #SCREEN_B-BWI-1,a0                 ; Move ptr to end of blit
             ext.l       d5
             add.l       d5,a0
             add.l       d5,a0

             add.w       #H*BPLS*64,d5                      ; d5.w = blit size

             WAITBLIT
             move.w      #SRCB!SRCC!DEST!$ca,bltcon0(a6)
             move.w      d2,bltcon1(a6)
             move.l      a0,bltbpt(a6)                      ; Source for shifted data
             move.l      a0,bltcpt(a6)                      ; Original data for masked areas
             move.l      a0,bltdpt(a6)                      ; Destination
             move.w      d6,bltbmod(a6)
             move.w      d6,bltcmod(a6)
             move.w      d6,bltdmod(a6)
             move.w      #$ffff,bltadat(a6)
             move.w      d3,bltalwm(a6)
             move.w      d4,bltafwm(a6)
             move.w      d5,bltsize(a6)

             movem.l     (sp)+,d0-a6
             rts


;-------------------------------------------------------------------------------
; Insert add additional column into image by shifting from center
; d0.w = column to delete
; d1.w = current width
; a0.l = draw screen
InsertCol:
             movem.l     d0-a6,-(sp)
             moveq       #1,d2                              ; shift by 1

             move.w      #W,d3                              ; calculate start column of image
             sub.w       d1,d3                              ; screen width - current width / 2
             lsr.w       d3

             cmp.w       #W/2,d0
             bge         .rhs

             move.w      d0,d1
             move.w      d3,d0
             subq.w      #2,d0
             move        #0,d0
             bsr         ShiftLeft
             bra         .end
.rhs
             move.w      #W-1,d1
            ;  sub.w       d3,d1
             bsr         ShiftRight
.end         movem.l     (sp)+,d0-a6
             rts

;-------------------------------------------------------------------------------
; a0=image source
; a1=screen destination address to clear
CopyImage:
             bsr         WaitBlitter
             clr.w       bltamod(a6)
             clr.w       bltdmod(a6)
             move.w      #BLTEN_AD+BLT_A,bltcon0(a6)
             move.l      a0,bltapt(a6)
             move.l      a1,bltdpt(a6)
             move.w      #$ffff,bltafwm(a6)
             move.w      #$ffff,bltalwm(a6)
             move.w      #H*BPLS*64+BWI/2,bltsize(a6)
             rts

;-------------------------------------------------------------------------------
; Double buffering of copper and screen
SwapBuffer:
             movem.l     DrawCopper(pc),a2-a3
             exg         a2,a3
             movem.l     a2-a3,DrawCopper
             movem.l     DrawScreen(pc),a2-a3
             exg         a2,a3
             movem.l     a2-a3,DrawScreen
             movem.l     DrawWidth(pc),a2-a3
             exg         a2,a3
             movem.l     a2-a3,DrawWidth
             rts

;-------------------------------------------------------------------------------
; Vertical blank interupt
VBint:
             movem.l     d0/a6,-(sp)                        ;Save used registers
             lea         custom,a6
             btst        #5,intreqr+1(a6)                   ;check if it's our vertb int.
             beq.s       .notvb

             move.l      Frame(pc),d0                       ; Increment frame
             add.l       #1,d0
             move.l      d0,Frame

             moveq       #$20,d0                            ;poll irq bit
             move.w      d0,intreq(a6)
             move.w      d0,intreq(a6)
.notvb:      movem.l     (sp)+,d0/a6                        ;restore
             rte

;-------------------------------------------------------------------------------
; Copy initial copper data to buffer
; a0 = dest
CopyCopper:
             lea         Copper(pc),a1
             move.w      #(CopperE-Copper)/4-1,d0
.l0          move.l      (a1)+,(a0)+
             dbf         d0,.l0
             rts

;-------------------------------------------------------------------------------
; Generic, poke ptrs into copper list
; a0 = screen
; a1 = copper address
PokePtrs:
             moveq       #BPLS-1,d1
             add.l       #BplPtrs+2-Copper,a1
.bpll:       move.l      a0,d2
             swap        d2
             move.w      d2,(a1)                            ;high word of address
             move.w      a0,4(a1)                           ;low word of address
             addq.w      #8,a1                              ;skip two copper instructions
             add.l       #BWI,a0                            ;next ptr
             dbf         d1,.bpll
             rts

;-------------------------------------------------------------------------------
; Scale effect with current image
ScaleV:
             movem.l     d0-a6,-(sp)
             move.l      DrawCopper,a2
             move.w      ScaleHeight,d1                     ; d1.w = height
; Adjust for image shorter than screen:
             move.w      #H,d2
             sub.w       d1,d2                              ; d2 = screen to image height diff / 2
             asr.w       d2
             move.b      #DIW_V,d3                          ; Calc diwstrt
             add.b       d2,d3
             lsl.w       #8,d3
             move.b      #$81,d3
             move.w      d3,2(a2)
             move.b      #DIW_V-1,d3                        ; Calc diwstop
             sub.b       d2,d3
             lsl.w       #8,d3
             move.b      #$c1,d3
             move.w      d3,6(a2)

             add.l       #Lines-Copper+2,a2
            ;  mulu.w      #12,d2
            ; (x<<2 - x)<<2
             move.w      d2,d3
             lsl.w       #2,d2
             sub.w       d3,d2
             lsl.w       #2,d2
             ext.l       d2
             add.l       d2,a2
             move.l      #H<<7,d0                           ; d0.l = scale fraction FP
             divu        d1,d0
             ext.l       d0
             clr.w       d2                                 ; d2.w = last image line
             clr.l       d3                                 ; d3.l = scaled line FP
.line:
; Calculate modulo for line delta:
             move.l      d3,d6                              ; d6.w = scaled line < FP
             lsr.l       #7,d6
             move.w      d6,d5                              ; d5.w = line delta (currentLine - prevLine)
             sub.w       d2,d5
             move.w      d6,d2                              ; update last line
            ;  mulu.w      #BWI*BPLS,d5                       ; d5.w = modulo
             ; Optimise: Avoid mulu in inner loop
             ; x*120
             ; x*128 - x*8
             ; (x*16-x)*8
             ; (x<<4-x)<<3
             move.w      d5,d6
             lsl.w       #4,d5
             sub.w       d6,d5
             lsl.w       #3,d5

             sub.w       #BWI,d5
             move.w      d5,(a2)
             move.w      d5,4(a2)
; Next line
             add.l       d0,d3
             lea         12(a2),a2
             dbf.w       d1,.line

             movem.l     (sp)+,d0-a6
             rts

********************************************************************************
* Fastmem data:
********************************************************************************

Arr:
             dc.w        $10,$30,$15,$3,$40,$17,$1,$39

Frame        dc.l        0
DrawScreen   dc.l        Screen2
ViewScreen   dc.l        Screen1
DrawCopper   dc.l        Copper2
ViewCopper   dc.l        Copper1
ScaleStep    dc.w        0
ScaleHeight  dc.w        H
ScaleWidth   dc.w        W
ScaleInc     dc.w        -5
DrawWidth    dc.l        Width2
ViewWidth    dc.l        Width1
Width1       dc.w        W
Width2       dc.w        W

Copper:
             dc.w        diwstrt,$2c81
             dc.w        diwstop,$2cc1
             dc.w        ddfstrt,$38
             dc.w        ddfstop,$d0
             dc.w        fmode,0
             dc.w        bplcon0,BPLS<<12+$200
             dc.w        bplcon1,$0c00
             dc.w        bplcon3,0
             dc.w        bpl1mod,IMAGE_MOD
             dc.w        bpl2mod,IMAGE_MOD
Palette:
            ;  incbin      "abstract.pal"
             incbin      "test.pal"
BplPtrs:
             dc.w        bpl0pt,0
             dc.w        bpl0ptl,0
             dc.w        bpl1pt,0
             dc.w        bpl1ptl,0
             dc.w        bpl2pt,0
             dc.w        bpl2ptl,0
Lines:
.l           SET         $2bdf
             REPT        256-$2b
             dc.w        bpl1mod,IMAGE_MOD
             dc.w        bpl2mod,IMAGE_MOD
             dc.w        .l,$fffe
.l           SET         .l+$100
             ENDR
.l           SET         $df
             REPT        $2b
             dc.w        bpl1mod,IMAGE_MOD
             dc.w        bpl2mod,IMAGE_MOD
             dc.w        .l,$fffe
.l           SET         .l+$100
             ENDR
             dc.l        $fffffffe
CopperE:

ColPositions:
             dc.w        160,80,265,40,221,131,291,98
             dc.w        191,16,239,142,272,55,173,105
             dc.w        223,26,294,83,193,116,239,7
             dc.w        160,63,266,141,196,44,248,86
             dc.w        170,30,273,123,203,56,148,102
             dc.w        228,10,210,91,272,45,172,122
             dc.w        186,19,235,70,154,106,244,31
             dc.w        197,61,144,128,219,3,170,74
             dc.w        242,95,199,36,151,56,223,106
             dc.w        127,15,195,82,172,45,234,113
             dc.w        152,22,196,64,137,83,219,7
             dc.w        168,94,150,39,197,55,120,25
             dc.w        222,106,169,68,149,10,185,83
             dc.w        120,44,195,29,131,93,163,59
             dc.w        153,16,197,73,105,39,163,91
             dc.w        133,1,177,63,117,31,170,78
             dc.w        133,19,186,47,102,93,140,11
             dc.w        151,55,111,40,167,68,114,22
             dc.w        139,74,88,3,162,45,121,57
             dc.w        141,25,95,77,145,13,111,37
             dc.w        119,59,157,28,87,68,123,6
             dc.w        95,44,136,31,97,71,125,14
             dc.w        76,46,136,19,101,55,81,3
             dc.w        113,35,103,55,89,22,120,40
             dc.w        69,9,109,57,87,25,118,42
             dc.w        72,6,92,28,73,56,102,13
             dc.w        58,31,89,42,79,9,100,20
             dc.w        60,44,86,1,65,33,74,23
             dc.w        94,43,52,13,64,27,79,10
             dc.w        54,32,79,14,61,39,42,3
             dc.w        66,21,61,31,50,14,71,5
             dc.w        41,25,60,15,46,29,61,6
             dc.w        38,20,47,9,48,29,31,2
             dc.w        55,16,35,20,46,11,35,6
             dc.w        27,20,39,11,33,2,39,19
             dc.w        24,7,30,12,18,3,31,12
             dc.w        22,8,25,12,18,1,25,6
             dc.w        14,11,16,3,17,6,10,3
             dc.w        12,6,13,1,8,4,7,2
             dc.w        7,3,3,1,3,1,1,0
ColPositionsE:

SrcCols:
             dc.w        160,80,267,40,224,133,297,100
             dc.w        196,16,247,147,283,57,181,110
             dc.w        235,27,312,88,206,124,257,7
             dc.w        173,68,290,154,215,48,274,95
             dc.w        189,33,306,138,229,63,168,116
             dc.w        261,11,242,105,316,52,201,143
             dc.w        219,22,279,83,184,127,294,37
             dc.w        239,74,176,157,270,3,211,92
             dc.w        303,119,251,45,192,71,286,136
             dc.w        164,19,254,107,226,59,310,150
             dc.w        203,29,264,86,186,113,300,9
             dc.w        232,130,209,54,277,77,170,35
             dc.w        318,152,244,98,217,14,272,122
             dc.w        178,65,292,43,198,141,249,90
             dc.w        236,24,307,114,165,61,259,145
             dc.w        213,1,287,102,191,50,281,129
             dc.w        222,31,314,79,174,159,241,18
             dc.w        263,96,195,70,298,121,205,39
             dc.w        253,135,162,5,302,84,228,108
             dc.w        269,47,183,149,284,25,220,73
             dc.w        238,118,319,56,179,140,256,12
             dc.w        200,93,291,66,210,155,275,30
             dc.w        169,103,308,42,231,126,188,6
             dc.w        266,82,246,132,216,53,296,99
             dc.w        172,21,278,146,225,64,311,111
             dc.w        193,15,250,76,202,156,288,36
             dc.w        166,89,260,123,234,26,304,60
             dc.w        185,137,271,2,208,106,243,75
             dc.w        315,144,177,44,223,94,282,34
             dc.w        197,117,295,51,233,151,163,10
             dc.w        265,85,252,128,212,58,309,20
             dc.w        182,112,276,69,218,139,299,28
             dc.w        190,101,245,46,258,158,171,8
             dc.w        317,91,207,120,285,67,227,38
             dc.w        180,134,273,78,240,13,301,148
             dc.w        194,55,255,104,161,23,293,115
             dc.w        221,81,268,131,204,4,313,72
             dc.w        187,153,237,41,280,97,175,49
             dc.w        248,125,305,17,214,109,230,62
             dc.w        289,142,167,32,262,87,199,0
SrcColsE:

*******************************************************************************
             SECTION     FastBuffers,BSS
*******************************************************************************

Cols:        ds.w        16

*******************************************************************************
             SECTION     ChipData,DATA_C
*******************************************************************************
Image:
             incbin      "test.raw"
            ;  incbin      "abstract.raw"

*******************************************************************************
             SECTION     ChipBuffers,BSS_C
*******************************************************************************

Screen1:     ds.b        SCREEN_B*2
Screen2:     ds.b        SCREEN_B*2
Copper1:     ds.l        CopperE-Copper
Copper2:     ds.l        CopperE-Copper

             END
