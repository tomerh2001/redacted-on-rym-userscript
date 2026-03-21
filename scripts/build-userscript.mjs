import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const outputDir = path.join(rootDir, 'dist');

await mkdir(outputDir, { recursive: true });

const userscriptHeader = `// ==UserScript==
// @name         RED + OPS on RYM
// @namespace    https://github.com/tomerh2001/redacted-on-rym-userscript
// @version      ${packageJson.version}
// @description  Show whether the current Rate Your Music album, single, or artist page already exists on RED or OPS.
// @author       ${packageJson.author}
// @match        https://rateyourmusic.com/release/album/*
// @match        https://rateyourmusic.com/release/single/*
// @match        https://rateyourmusic.com/artist/*
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      redacted.sh
// @connect      orpheus.network
// @run-at       document-idle
// @homepageURL  https://github.com/tomerh2001/redacted-on-rym-userscript
// @supportURL   https://github.com/tomerh2001/redacted-on-rym-userscript/issues
// @downloadURL  https://github.com/tomerh2001/redacted-on-rym-userscript/releases/latest/download/redacted-on-rym.user.js
// @updateURL    https://github.com/tomerh2001/redacted-on-rym-userscript/releases/latest/download/redacted-on-rym.user.js
// ==/UserScript==`;

await build({
  entryPoints: [path.join(rootDir, 'src', 'userscript.js')],
  outfile: path.join(outputDir, 'redacted-on-rym.user.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  legalComments: 'none',
  banner: {
    js: userscriptHeader,
  },
});
