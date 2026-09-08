import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";

const CODE = "  move.l d0,d1\n  move.l d2,d3\n  move.l d4,d5";

test("parses code, selects a range, and clears selection", () => {
  render(<App />);

  const textarea = screen.getByPlaceholderText("Paste or drop ASM source here");
  fireEvent.change(textarea, { target: { value: CODE } });
  fireEvent.click(screen.getByText("Analyse"));

  const rows = document.querySelectorAll(".Line");
  expect(rows.length).toBe(3);

  // Start selection on row 0, finish on row 2
  fireEvent.click(rows[0]);
  fireEvent.click(rows[2]);

  // A LineTotals summary should now be rendered for the selected range
  expect(document.querySelector(".LineTotals")).not.toBeNull();

  // Clicking the clear (x) button should reset the selection
  fireEvent.click(screen.getByText("×"));
  expect(document.querySelector(".LineTotals")).toBeNull();

  // Re-select, then cancel by clicking the start row again
  fireEvent.click(rows[0]);
  fireEvent.click(rows[0]);
  expect(document.querySelectorAll(".Line.selected").length).toBe(0);

  // Escape key should also clear an in-progress selection
  fireEvent.click(rows[1]);
  fireEvent.mouseEnter(rows[1]);
  expect(document.querySelectorAll(".Line.selected").length).toBeGreaterThan(0);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(document.querySelectorAll(".Line.selected").length).toBe(0);
});
