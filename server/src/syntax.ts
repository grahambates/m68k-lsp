export const sizes: Size[] = ["b", "w", "l", "q", "s", "d", "x", "p"];

export type Size = "b" | "w" | "l" | "q" | "s" | "d" | "x" | "p";

export type RegisterName = "pc" | "sr" | "ccr" | "usp" | "vbr";

export type AddressingMode =
  | "dn"
  | "an"
  | "anIndirect"
  | "anPostInc"
  | "anPreDec"
  | "anOffset"
  | "anIdx"
  | "absW"
  | "absL"
  | "pcOffset"
  | "pcIdx"
  | "imm";

export const sectionTypes = [
  "bss",
  "bss_c",
  "bss_f",
  "bss_p",
  "text",
  "text_c",
  "text_f",
  "text_p",
  "code",
  "code_c",
  "code_f",
  "code_p",
  "cseg",
  "data",
  "data_c",
  "data_f",
  "data_p",
  "dseg",
];

export const memoryTypes = ["chip", "fast"];

export const registerNames: RegisterName[] = ["pc", "sr", "ccr", "usp", "vbr"]; // exclude sp

export const cpuTypes = [
  "68000",
  "68010",
  "68020",
  "68030",
  "68040",
  "68060",
  "68851",
  "68881",
  "68882",
  "cpu32",
];
