import { FC, useEffect, useCallback, useReducer } from "react";
import reducer, { defaultState } from "../reducer";
import "./App.css";
import Form from "./Form";
import Github from "./icons/Github";
import Logo from "./icons/Logo";
import VsCode from "./icons/VsCode";
import Line from "./Line";
import Totals from "./Totals";

const App: FC = () => {
  const [state, dispatch] = useReducer(reducer, defaultState);
  const {
    lines,
    totals,
    selectionStart,
    selectionEnd,
    selectionHover,
    selectionTotals,
  } = state;

  const handleSubmit = (code: string) => {
    dispatch({ type: "code", payload: code });
    setTimeout(() => {
      document
        .getElementById("results")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 10);
  };

  const clearSelection = useCallback(() => {
    dispatch({ type: "clear" });
  }, [dispatch]);

  const handleClick = useCallback(
    (i: number) => {
      dispatch({ type: "click", payload: i });
    },
    [dispatch],
  );

  const handleHover = useCallback(
    (i: number) => {
      dispatch({ type: "hover", payload: i });
    },
    [dispatch],
  );

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
            const a = selectionStart;
            const b = selectionEnd !== null ? selectionEnd : selectionHover;
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
                totals={i === selectionStart ? selectionTotals : null}
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

export default App;
