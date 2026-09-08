import { FC, useCallback, useEffect, useState } from "react";
import {
  calculateTotals,
  Line as LineType,
  Totals as TotalsType,
} from "68kcounter";
import { parse } from "../parse";
import "./App.css";
import { Form } from "./Form";
import { Github } from "./icons/Github";
import { Logo } from "./icons/Logo";
import { VsCode } from "./icons/VsCode";
import { Line } from "./Line";
import { Totals } from "./Totals";

interface Selection {
  start: number | null;
  end: number | null;
  hover: number | null;
  totals: TotalsType | null;
}

const defaultSelection: Selection = {
  start: null,
  end: null,
  hover: null,
  totals: null,
};

export const App: FC = () => {
  const [lines, setLines] = useState<LineType[] | null>(null);
  const [totals, setTotals] = useState<TotalsType | null>(null);
  const [selection, setSelection] = useState<Selection>(defaultSelection);

  const handleSubmit = (code: string) => {
    if (code) {
      const parsedLines = parse(code);
      setLines(parsedLines);
      setTotals(calculateTotals(parsedLines));
    } else {
      setLines(null);
      setTotals(null);
    }
    setSelection(defaultSelection);
    setTimeout(() => {
      document
        .getElementById("results")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 10);
  };

  const clearSelection = useCallback(() => {
    setSelection((s) => ({ ...s, start: null, end: null, totals: null }));
  }, []);

  const handleClick = useCallback(
    (i: number) => {
      setSelection((s) => {
        if (s.start !== null && s.end === null) {
          if (i === s.start) {
            // Cancel selection if clicking the start row again
            return { ...s, start: null, end: null, hover: null };
          }
          // Finish selection
          const min = Math.min(i, s.start);
          const max = Math.max(i, s.start);
          const range = (lines as LineType[]).slice(min, max + 1);
          return {
            ...s,
            start: min,
            end: max,
            hover: null,
            totals: calculateTotals(range),
          };
        }
        // Start new selection
        return { start: i, end: null, hover: null, totals: null };
      });
    },
    [lines],
  );

  const handleHover = useCallback((i: number) => {
    setSelection((s) => ({ ...s, hover: i }));
  }, []);

  // Clear selection on escape
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [clearSelection]);

  return (
    <div className="App">
      <div className="App__header">
        <div>
          <div className="App__logo">
            <Logo size="300" />
          </div>
          <div className="App__intro">
            <p>
              Analyses 68000 assembly source to show cycle timings and
              instruction sizes.
            </p>
            <div className="App__links">
              <VsCode />
              <a href="https://marketplace.visualstudio.com/items?itemName=gigabates.68kcounter">
                VS Code extension
              </a>
              <Github />
              <a href="https://github.com/grahambates/68kcounter">
                JS package + CLI tool
              </a>{" "}
            </div>
          </div>
        </div>

        <Form onSubmit={handleSubmit} />
      </div>

      {lines && (
        <div id="results">
          <div className="App__resultsHeader">
            {totals && <Totals totals={totals} />}

            <div className="App__help">
              <ul>
                <li>
                  Data is shown in the format:{" "}
                  <code>cycles(reads/writes) bytes</code>
                </li>
                <li>
                  Some timings can be expanded to show how they&apos;re
                  calculated
                </li>
                <li>
                  Click to select a range of lines and calculate totals for a
                  section of code.
                </li>
              </ul>
            </div>
          </div>

          {lines.map((line, i) => {
            const a = selection.start;
            const b = selection.end !== null ? selection.end : selection.hover;
            const isSelected =
              a !== null &&
              b !== null &&
              i >= Math.min(a, b) &&
              i <= Math.max(a, b);

            return (
              <Line
                key={i + line.statement.text}
                line={line}
                index={i}
                totals={i === selection.start ? selection.totals : null}
                isSelected={isSelected}
                onHover={handleHover}
                onClick={handleClick}
                onClearSelection={clearSelection}
              />
            );
          })}
        </div>
      )}
      <div className="App__footer">&copy; 2021 Graham Bates</div>
    </div>
  );
};
