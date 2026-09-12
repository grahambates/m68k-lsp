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

/**
 * Directives that control assembly flow rather than emitting data.
 *
 * m68k-parser classifies all of these as directives, but the formatter offers
 * a separate case option for them (`m68k.format.case.control`), so the
 * distinction is kept here. Mirrors `control_mnemonic` in the tree-sitter
 * grammar.
 */
export const controlMnemonics = new Set([
  // Conditional assembly
  "if",
  "ifeq",
  "ifne",
  "ifgt",
  "ifge",
  "iflt",
  "ifle",
  "ifb",
  "ifnb",
  "if1",
  "if2",
  "ifp1",
  "ifc",
  "ifnc",
  "ifd",
  "ifnd",
  "ifmacrod",
  "ifmacrond",
  "iif",
  "else",
  "elseif",
  "endif",
  "endc",
  // Blocks
  "macro",
  "endm",
  "rem",
  "erem",
  "rept",
  "endr",
  "end",
]);
