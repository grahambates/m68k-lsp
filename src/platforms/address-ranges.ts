import type { Platform } from "../core/config.js";

export interface ExpectedAbsoluteAddressRange {
  start: number;
  end: number;
  description: string;
}

/**
 * Numeric absolute-address regions that are commonplace enough on a platform
 * that they should not trigger the missing-# footgun heuristic.
 *
 * This is intentionally a lint heuristic, not a complete platform memory map.
 */
export const expectedAbsoluteAddressRanges: Readonly<Record<Platform, readonly ExpectedAbsoluteAddressRange[]>> = {
  generic: [],
  amiga: [
    { start: 0x000000, end: 0x0000bc, description: "68000 zero-page exception vectors" },
    { start: 0xbfd000, end: 0xbfefff, description: "Amiga CIA register space" },
    { start: 0xdff000, end: 0xdff1fc, description: "Amiga custom-chip registers" },
  ],
};

export function expectedAbsoluteAddressRange(
  platform: Platform,
  address: number,
): ExpectedAbsoluteAddressRange | undefined {
  const unsigned = address >>> 0;
  return expectedAbsoluteAddressRanges[platform].find((range) => unsigned >= range.start && unsigned <= range.end);
}
