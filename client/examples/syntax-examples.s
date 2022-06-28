;---------------------------------------------
; Comments
;---------------------------------------------

; Line comment semicolon
    ; Line comment semicolon indented
            move.w    d0,d1                     ; Line comment semicolon instruction
            move.w    d0,d1; Line comment semicolon instruction no space
            rts                                 ; Line comment semicolon instraction no operands
* Line comment asterisk
    * Line comment asterisk indented
            move.w    d0,d1                     * Line comment asterisk indented instruction

            move.w    d0,d1                     positional comment
label1:     move.w    d0,d1                     positional comment with label
label2      move.w    d0,d1                     positional comment with label no colon
  label3:   move.w    d0,d1                     positional comment with label leading whitespace
            move.w    d0, d1                    positional comment with operand spaces (-spaces option in vasm)
            rts                                 positional comment no operand

            rem
Lorem ipsum dolor sit amet, 
consectetur adipiscing elit. 
Curabitur aliquet non velit sit amet condimentum. 
Donec aliquam felis vel fermentum scelerisque. 
Mauris sit amet velit sit amet dui rhoncus tincidunt.
            erem

;---------------------------------------------
; Instructions
;---------------------------------------------

            move      d0,d1                     ; Mnemonic
            move.w    d0,d1                     ; with size 
            rts                                 ; no operands 
label4:     move.w    d0,d1                     ; label
label5      move.w    d0,d1                     ; label no colon
  label6:   move.w    d0,d1                     ; label leading whitespace
.label7:    move.w    d0,d1                     ; local label prefix
label7$:    move.w    d0,d1                     ; local label suffix
label7::    move.w    d0,d1                     ; external label
label8:                                         ; Standalone label

;---------------------------------------------
; Operands
;---------------------------------------------

            move.w    d0,(a0)                   ; indirect
            move.w    d0,(a0)+                  ; post increment
            move.w    d0,-(a0)                  ; pre decrement
            move.w    d0,myOffset(a0)           ; offset symbol
            move.w    d0,1(a0)                  ; offset literal
            move.w    d0,myOffset-1(a0)         ; offset expression
            move.w    d0,myOffset(a0,d0.w)      ; offset idx
            move.w    $100,d1                   ; absolute
            move.w    $100.w,d1                 ; absolute sized
            move.w    #$100,d1                  ; immediate literal
            move.w    #myVar,d1                 ; immediate symbol
            move.w    #($100*2/EXAMPLE1)/4,d1   ; immediate expression

;---------------------------------------------
; Data
;---------------------------------------------

            dc.w    $1,$2,$3                    ; numeric literals
            dc.b    'some text',0               ; string literal
            ds.l    100*EXAMPLE1                ; space expression

;---------------------------------------------
; Assignment
;---------------------------------------------

EXAMPLE1 = $100                                 ; operator
EXAMPLE2=$100                                   ; operator no space
EXAMPLE3 equ $100                               ; equ directive
EXAMPLE4 set $100                               ; set directive
EXAMPLE4 equr d0                                ; register alias                             ; shorthand section

;---------------------------------------------
; Blocks
;---------------------------------------------


    macro name                                  ; macro directive
    move.w    d0,d1
    endm

name2   macro                                   ; macro label
        move.w    d0,d1
        endm

    ifeq EXAMPLE1                               ; Conditional block
    move.w    d0,d1
    endc

    ifeq EXAMPLE1                               ; If/else block
    move.w    d0,d1
    else
    move.w    d0,d2
    endc

    rept 100
    move.w    reptn,d0
    endr

;---------------------------------------------
; Macro args
;---------------------------------------------

    macro name
\1:           move.w        d0,d1                     ; numbered arg as label
\@:           move.w        d0,d1                     ; count arg as label
foo\1bar:     move.w        d0,d1                     ; numbered arg in label
foo\<abc>bar: move.w        d0,d1                     ; quoted arg in label
label4:       \2.w          d0,d1                     ; numbered arg as mnemonic
label5:       foo\1bar.w    d0,d1                     ; numbered arg in mnemonic
label6:       move.\2       d0,d1                     ; numbered arg as qualifier
label7:       move.w        \2,d1                     ; numbered arg as operand
label8:       move.w        foo\2bar+\3,d1            ; numbered args in operand
    endm

;---------------------------------------------
; Literal types
;---------------------------------------------

            dc.b    %0100101                    ; binary
            dc.b    @123                        ; octal
            dc.b    -@123                       ; octal signed
            dc.b    123                         ; decimal
            dc.b    -123                        ; decimal signed
            dc.b    $1f                         ; hexadecimal
            dc.b    -$1f                        ; hexadecimal signed
            dc.b    'some text'                 ; string single quotes
            incdir  'some '' text'              ; string single quotes repeat escape
            incdir  'some \' \n\b \xf9 \@ text' ; string single quotes backslash escape (-esc option in vasm)
            dc.b    "some text"                 ; string double quotes
            incdir  "some "" text"              ; string double quotes repeat escape
            incdir  "some \" \n\b \xf9 \@ text" ; string double quotes backslash escape (-esc option in vasm)
            incdir  some/path/file.s            ; unquoted path

;---------------------------------------------
; Sections
;---------------------------------------------

            section section1,bss,chip           ; named section
            section section2,bss_c              ; named section shorthand type
            bss_c  

            end
Lorem ipsum dolor sit amet, 
consectetur adipiscing elit. 
Curabitur aliquet non velit sit amet condimentum. 
Donec aliquam felis vel fermentum scelerisque. 
Mauris sit amet velit sit amet dui rhoncus tincidunt.           