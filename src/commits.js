// Reads commit messages and parses them as Conventional Commits 1.0.0
// (https://www.conventionalcommits.org/en/v1.0.0/). "item N" is the numbered item of that specification.
// The tool never runs git: it reads the messages from a file that a pipeline step wrote.

import { readFile, stat } from 'node:fs/promises';

export const LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  maxCommits: 50000,
  maxLineBytes: 16 * 1024
};

export const SEPARATORS = ['nul', 'blank'];
export const DEFAULT_TYPES = { minor: ['feat'], patch: ['fix', 'perf'] };
export const LONG_LINE = '[line over 16 KB, not read]';

// type, optional (scope), optional !, then ": " and a description (items 1 to 5).
const HEADER = /^([A-Za-z][A-Za-z0-9-]*)(?:\(([^()\r\n]+)\))?(!)?: (\S.*)$/;
// A footer is a word token, or BREAKING CHANGE, then ": " or " #" (items 8 and 9).
const FOOTER = /^(BREAKING CHANGE|[A-Za-z][A-Za-z0-9-]*)(?:: | #)/;
// BREAKING CHANGE and its synonym BREAKING-CHANGE, in upper case (items 11, 15 and 16).
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:(?:\s|$)/;
const BREAKING_ANY_CASE = /^breaking[ -]change:/i;
const TYPE_NAME = /^[a-z][a-z0-9-]*$/;

// Splits the text of a commit file into messages.
//   nul:   messages separated by a NUL character, as `git log --format=%B%x00` writes them
//   blank: one message per block of lines, blocks separated by blank lines
// Lines over the line limit are replaced by a marker and counted; they are never parsed.
export function splitMessages(text, separator = 'nul', limits = LIMITS) {
  if (!SEPARATORS.includes(separator)) throw new Error(`unknown separator ${separator} (nul or blank)`);
  const clean = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const chunks = separator === 'nul' ? clean.split('\0') : clean.split(/\n(?:[ \t]*\n)+/);
  const messages = [];
  let longLines = 0;
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((line) => {
      if (Buffer.byteLength(line, 'utf8') <= limits.maxLineBytes) return line.replace(/\s+$/, '');
      longLines += 1;
      return LONG_LINE;
    });
    while (lines.length && lines[0].trim() === '') lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    if (!lines.length) continue;
    messages.push(lines.join('\n'));
    if (messages.length > limits.maxCommits) {
      throw new Error(`more than ${limits.maxCommits.toLocaleString('en-US')} commit messages, which is over the limit; check a shorter range of commits`);
    }
  }
  const noSeparator = separator === 'nul' && !clean.includes('\0') && messages.length === 1 && /\n[ \t]*\n/.test(messages[0]);
  return { messages, longLines, noSeparator };
}

// Footers in the last paragraph of the message, when that paragraph starts with one (items 8 to 10).
export function parseFooters(lines) {
  let start = lines.length;
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1;
  const last = lines.slice(start);
  if (!last.length || !FOOTER.test(last[0])) return [];
  const tokens = [];
  for (const line of last) {
    const m = FOOTER.exec(line);
    if (m) tokens.push(m[1]);
  }
  return tokens;
}

// Parses one message. Returns the first line, whether it follows the Conventional Commits form,
// and its type, scope, footer tokens and whether it is marked as breaking.
export function parseCommit(message) {
  const lines = String(message).replace(/\r\n?/g, '\n').split('\n');
  const firstLine = lines[0].trim();
  const m = HEADER.exec(firstLine);
  if (!m) {
    return { firstLine, parsed: false, type: null, scope: null, breaking: false, breakingFrom: null, footers: [], breakingWrongCase: false };
  }
  const rest = lines.slice(1);
  // A BREAKING CHANGE line counts wherever it stands after the first line: the stricter reading.
  const footerBreaking = rest.some((line) => BREAKING_FOOTER.test(line));
  const breakingFrom = m[3] ? 'header' : footerBreaking ? 'footer' : null;
  return {
    firstLine,
    parsed: true,
    type: m[1].toLowerCase(), // item 15: types are not case sensitive
    scope: m[2] === undefined ? null : m[2].trim(),
    breaking: breakingFrom !== null,
    breakingFrom,
    footers: parseFooters(rest),
    breakingWrongCase: !footerBreaking && rest.some((line) => BREAKING_ANY_CASE.test(line))
  };
}

function typeList(value, option) {
  const list = (value || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  for (const t of list) if (!TYPE_NAME.test(t)) throw new Error(`${option}: "${t.slice(0, 40)}" is not a commit type (letters, digits and hyphens)`);
  return list;
}

// The commit types that need a minor or a patch bump: feat, fix and perf, plus the extra ones given.
export function buildTypes(minorExtra = [], patchExtra = []) {
  const minor = new Set([...DEFAULT_TYPES.minor, ...typeList(minorExtra, '--minor-types')]);
  const patch = new Set([...DEFAULT_TYPES.patch, ...typeList(patchExtra, '--patch-types')]);
  const both = [...minor].filter((t) => patch.has(t));
  if (both.length) throw new Error(`type ${both.join(', ')} cannot need both a minor and a patch bump`);
  return { minor, patch };
}

// The bump a commit needs: major (breaking), minor, patch, none, or unknown when it was not parsed.
export function classifyCommit(commit, types = buildTypes()) {
  if (!commit.parsed) return 'unknown';
  if (commit.breaking) return 'major';
  if (types.minor.has(commit.type)) return 'minor';
  if (types.patch.has(commit.type)) return 'patch';
  return 'none';
}

// Reads a commit file. Refuses anything that is not a regular file or is over the size limit, before reading it.
export async function loadCommits(path, separator = 'nul', limits = LIMITS) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`${path}: not a file`);
  if (info.size > limits.maxFileBytes) {
    throw new Error(`${path}: ${info.size} bytes is over the ${limits.maxFileBytes / 1024 / 1024} MB limit`);
  }
  const text = await readFile(path, 'utf8');
  try {
    return { source: path, ...splitMessages(text, separator, limits) };
  } catch (error) {
    throw new Error(`${path}: ${error.message}`);
  }
}
