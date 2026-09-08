import process, { calculateTotals, Line, Totals } from "68kcounter";

interface CodeAction {
  type: "code";
  payload: string;
}
interface TotalsAction {
  type: "totals";
  payload: Totals | null;
}
interface ClickAction {
  type: "click";
  payload: number;
}
interface ClearAction {
  type: "clear";
  payload?: void;
}
interface HoverAction {
  type: "hover";
  payload: number;
}

type Action =
  CodeAction | TotalsAction | ClickAction | HoverAction | ClearAction;

interface State {
  code: string;
  totals: Totals | null;
  lines: Line[] | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionHover: number | null;
  selectionTotals: Totals | null;
}

export const defaultState = {
  code: "",
  lines: null,
  totals: null,
  selectionStart: null,
  selectionEnd: null,
  selectionHover: null,
  selectionTotals: null,
};

const reducer = (state: State, { type, payload }: Action): State => {
  switch (type) {
    case "code": {
      const code = payload as string;
      if (code) {
        const lines = process(code);
        return {
          ...state,
          code,
          lines,
          selectionStart: null,
          selectionEnd: null,
          selectionHover: null,
          totals: calculateTotals(lines),
        };
      } else {
        return {
          ...state,
          code,
          lines: null,
          totals: null,
          selectionStart: null,
          selectionEnd: null,
          selectionHover: null,
          selectionTotals: null,
        };
      }
    }
    case "click": {
      const lineIndex = payload as number;
      const { selectionStart, selectionEnd } = state;

      if (selectionStart !== null && selectionEnd === null) {
        // End selection:
        if (lineIndex === selectionStart) {
          // Cancel selection if clicks again on start row
          return {
            ...state,
            selectionStart: null,
            selectionEnd: null,
            selectionHover: null,
          };
        } else {
          // Finish selection
          const min = Math.min(lineIndex, selectionStart);
          const max = Math.max(lineIndex, selectionStart);
          const range = (state.lines as Line[]).slice(min, max + 1);
          return {
            ...state,
            selectionStart: min,
            selectionEnd: max,
            selectionHover: null,
            selectionTotals: calculateTotals(range),
          };
        }
      } else {
        // Start new selection
        return {
          ...state,
          selectionStart: lineIndex,
          selectionEnd: null,
          selectionHover: null,
          selectionTotals: null,
        };
      }
    }
    case "hover":
      return {
        ...state,
        selectionHover: payload as number,
      };
    case "clear":
      return {
        ...state,
        selectionStart: null,
        selectionEnd: null,
        selectionTotals: null,
      };
  }
  return state;
};

export default reducer;
