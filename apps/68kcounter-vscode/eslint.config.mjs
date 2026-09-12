import config from '../../scripts/eslint-node.mjs';
import globals from 'globals';
export default [...config, { files: ['src/test/**/*.ts'], languageOptions: { globals: globals.mocha } }];
