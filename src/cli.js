// Command line: version-bump-check --from <version> (--to <version> | --package <file>) [--commits <file>] [options]

import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { loadCommits, buildTypes, SEPARATORS, LIMITS } from './commits.js';
import { checkRelease, FINDINGS } from './check.js';
import { toText, toMarkdown, toJson, toCsv } from './report.js';

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, csv: toCsv };
const THRESHOLDS = ['error', 'warning'];

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export const USAGE = `Usage: version-bump-check --from <version> (--to <version> | --package <file>) [--commits <file>] [options]

Checks that a release's version number matches the changes in it, following Semantic
Versioning 2.0.0, with the commit messages since the last release read as Conventional
Commits 1.0.0. It reads the files it is given and nothing else: it never runs git and
never opens a network connection. Write the messages to a file first, for example:

  git log --no-merges --format=%B%x00 v1.4.2..HEAD > commits.txt

Options:
  --from <version>        the previous release, such as 1.4.2
  --to <version>          the new version, such as 1.5.0
  --package <file>        read the new version from the "version" field of this package.json
  --commits <file>        the commit messages since the previous release
  --separator <name>      nul (messages separated by NUL, as above) or blank (one message per
                          block of lines, blocks separated by blank lines) (default: nul)
  --format <name>         text, markdown, json or csv (default: text)
  --fail-on <level>       exit with 1 when a finding is at this level or above: error or warning
                          (default: error)
  --strict                commit messages not in Conventional Commits form are errors
  --allow-larger          a bump larger than the commits need is info, not a warning
  --zero-major-strict     in 0.y.z, a breaking change needs 1.0.0 (default: at least a minor bump)
  --minor-types <types>   more commit types that need a minor bump, separated by commas
  --patch-types <types>   more commit types that need a patch bump, separated by commas
  --help                  show this text
  --version               show the version

Findings: ${FINDINGS.map((f) => f.id).join(', ')}

Exit codes: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error.
`;

export function parseArgs(argv) {
  const o = {
    from: null, to: null, packageFile: null, commits: null, separator: 'nul', format: 'text', failOn: 'error',
    strict: false, allowLarger: false, zeroMajorStrict: false, minorTypes: [], patchTypes: [], help: false, version: false
  };
  let separatorGiven = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    const list = () => next().split(',').map((s) => s.trim()).filter(Boolean);
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--from') o.from = next();
    else if (a === '--to') o.to = next();
    else if (a === '--package') o.packageFile = next();
    else if (a === '--commits') o.commits = next();
    else if (a === '--separator') { o.separator = next(); separatorGiven = true; }
    else if (a === '--format') o.format = next();
    else if (a === '--fail-on') o.failOn = next();
    else if (a === '--strict') o.strict = true;
    else if (a === '--allow-larger') o.allowLarger = true;
    else if (a === '--zero-major-strict') o.zeroMajorStrict = true;
    else if (a === '--minor-types') o.minorTypes.push(...list());
    else if (a === '--patch-types') o.patchTypes.push(...list());
    else if (a === '-' || a === '--commits=-') throw new Error('reading from standard input is not supported; give a file');
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.help && !o.version) {
    if (o.from === null) throw new Error('give the previous version with --from');
    if (o.to === null && o.packageFile === null) throw new Error('give the new version with --to or --package');
    if (o.to !== null && o.packageFile !== null) throw new Error('give the new version with --to or --package, not both');
    if (!SEPARATORS.includes(o.separator)) throw new Error(`unknown separator ${o.separator} (nul or blank)`);
    if (separatorGiven && o.commits === null) throw new Error('--separator needs --commits');
    if (!FORMATS[o.format]) throw new Error(`unknown format ${o.format} (text, markdown, json or csv)`);
    if (!THRESHOLDS.includes(o.failOn)) throw new Error(`--fail-on takes error or warning, not ${o.failOn}`);
    buildTypes(o.minorTypes, o.patchTypes);
  }
  return o;
}

// Reads the "version" field of a package.json. Bounded like the commit file.
export async function readPackageVersion(path, limits = LIMITS) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`${path}: not a file`);
  if (info.size > limits.maxFileBytes) throw new Error(`${path}: ${info.size} bytes is over the ${limits.maxFileBytes / 1024 / 1024} MB limit`);
  let doc;
  try {
    doc = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${path}: not valid JSON (${error.message})`);
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw new Error(`${path}: does not hold an object`);
  if (typeof doc.version !== 'string') throw new Error(`${path}: no "version" field with a text value`);
  return doc.version;
}

// Exit code: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`version-bump-check: ${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  let to = o.to;
  let messages = null;
  const notes = [];
  try {
    if (o.packageFile !== null) to = await readPackageVersion(o.packageFile);
    if (o.commits !== null) {
      const loaded = await loadCommits(o.commits, o.separator);
      messages = loaded.messages;
      if (loaded.longLines) notes.push(`${loaded.longLines} line(s) over 16 KB in the commit file were not read`);
      if (loaded.noSeparator) notes.push('the commit file holds no NUL character, so it was read as one message; write it with --format=%B%x00, or pass --separator blank');
    }
  } catch (error) {
    io.err(`version-bump-check: ${error.code === 'ENOENT' ? `${error.path}: no such file` : error.message}\n`);
    return 2;
  }
  const report = checkRelease(o.from, to, messages, {
    strict: o.strict, allowLarger: o.allowLarger, zeroMajorStrict: o.zeroMajorStrict,
    minorTypes: o.minorTypes, patchTypes: o.patchTypes, failOn: o.failOn, toSource: o.packageFile, notes
  });
  io.out(FORMATS[o.format](report));
  return report.gate.pass ? 0 : 1;
}
