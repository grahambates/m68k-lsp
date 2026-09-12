#!/usr/bin/env node
require("./out/cli.js")
  .main()
  .then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`m68k-format: ${error.message}`);
      process.exitCode = 2;
    },
  );
