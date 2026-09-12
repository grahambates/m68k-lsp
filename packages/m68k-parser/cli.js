#!/usr/bin/env node

import fs from "node:fs";
import { parseFile } from "./dist/index.mjs";

const [, , file] = process.argv;

function printUsage() {
  console.error("Usage: m68k-parser [file|-]");
  console.error("  Reads from a file, or from stdin if no file is given.");
  process.exit(1);
}

async function readInput() {
  // Case 1: user passed a filename (not '-')
  if (file && file !== "-") {
    return fs.promises.readFile(file, "utf8");
  }

  // Case 2: read from stdin (pipe or redirect)
  if (!process.stdin.isTTY || file === "-") {
    return new Promise((resolve, reject) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data));
      process.stdin.on("error", reject);
    });
  }

  // Case 3: no file, no stdin → show usage
  printUsage();
}

const input = (await readInput()).trim();

// Do something with the input
if (!input) {
  console.error("No input provided.");
  process.exit(1);
}

const result = parseFile(input);
console.log(JSON.stringify(result, null, 2));
