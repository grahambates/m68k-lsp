import { lengthLevel, Levels, timingLevel } from "../src/levels";

describe("lengthLevel()", () => {
  test("low", () => {
    const result = lengthLevel(2);
    expect(result).toEqual(Levels.Low);
  });

  test("med", () => {
    const result = lengthLevel(4);
    expect(result).toEqual(Levels.Med);
  });

  test("high", () => {
    const result = lengthLevel(6);
    expect(result).toEqual(Levels.High);
  });

  test("vhigh", () => {
    const result = lengthLevel(8);
    expect(result).toEqual(Levels.VHigh);
  });
});

describe("timingLevel()", () => {
  test("low", () => {
    const result = timingLevel([4, 0, 0]);
    expect(result).toEqual(Levels.Low);
  });

  test("med", () => {
    const result = timingLevel([12, 0, 0]);
    expect(result).toEqual(Levels.Med);
  });

  test("high", () => {
    const result = timingLevel([21, 0, 0]);
    expect(result).toEqual(Levels.High);
  });

  test("vhigh", () => {
    const result = timingLevel([31, 0, 0]);
    expect(result).toEqual(Levels.VHigh);
  });
});
