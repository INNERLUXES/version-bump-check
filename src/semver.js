// Semantic Versioning 2.0.0 (https://semver.org/): parsing, precedence and bump kinds.
// "item N" in the comments and messages is the numbered item of the specification.
// Numbers are kept as strings and compared by length, then digit by digit, so a version
// with numbers larger than JavaScript can hold exactly is still read and compared correctly.

export const BUMPS = ['none', 'patch', 'minor', 'major'];
export const BUMP_RANK = { none: 0, patch: 1, minor: 2, major: 3 };
export const MAX_VERSION_LENGTH = 256;

const NUMBER = /^(0|[1-9]\d*)$/;
const DIGITS = /^\d+$/;
const IDENTIFIER = /^[0-9A-Za-z-]+$/;
const CORE_NAMES = ['MAJOR', 'MINOR', 'PATCH'];

function quote(s) {
  const shown = s.length > 40 ? `${s.slice(0, 37)}...` : s;
  return `"${shown}"`;
}

// Returns { version } for a valid version, or { error } with the reason it is not one.
export function parseVersion(text) {
  if (typeof text !== 'string') return { error: 'no version given' };
  if (text.length === 0) return { error: 'empty' };
  if (text.length > MAX_VERSION_LENGTH) return { error: `longer than ${MAX_VERSION_LENGTH} characters` };
  if (text !== text.trim()) return { error: 'has spaces around it' };
  if (/^[vV]\d/.test(text)) {
    return { error: `starts with "${text[0]}": that is a tag name, not a version number (item 2); give ${quote(text.slice(1))}` };
  }
  const plus = text.indexOf('+');
  const build = plus === -1 ? null : text.slice(plus + 1);
  const rest = plus === -1 ? text : text.slice(0, plus);
  const dash = rest.indexOf('-');
  const core = dash === -1 ? rest : rest.slice(0, dash);
  const pre = dash === -1 ? null : rest.slice(dash + 1);

  const parts = core.split('.');
  if (parts.length !== 3 || parts.some((p) => !DIGITS.test(p))) {
    return { error: 'the version core must be three numbers separated by dots, MAJOR.MINOR.PATCH (item 2)' };
  }
  for (let i = 0; i < 3; i += 1) {
    if (!NUMBER.test(parts[i])) return { error: `${CORE_NAMES[i]} ${parts[i]} has a leading zero (item 2)` };
  }

  const prerelease = [];
  if (pre !== null) {
    if (pre === '') return { error: 'nothing after "-": a pre-release needs at least one identifier (item 9)' };
    for (const id of pre.split('.')) {
      if (id === '') return { error: 'empty pre-release identifier (item 9)' };
      if (!IDENTIFIER.test(id)) return { error: `pre-release identifier ${quote(id)} holds a character other than ASCII letters, digits and hyphens (item 9)` };
      if (DIGITS.test(id) && !NUMBER.test(id)) return { error: `numeric pre-release identifier ${quote(id)} has a leading zero (item 9)` };
      prerelease.push(id);
    }
  }

  const buildIds = [];
  if (build !== null) {
    if (build === '') return { error: 'nothing after "+": build metadata needs at least one identifier (item 10)' };
    for (const id of build.split('.')) {
      if (id === '') return { error: 'empty build metadata identifier (item 10)' };
      if (!IDENTIFIER.test(id)) return { error: `build metadata identifier ${quote(id)} holds a character other than ASCII letters, digits and hyphens (item 10)` };
      buildIds.push(id);
    }
  }

  return { version: { major: parts[0], minor: parts[1], patch: parts[2], prerelease, build: buildIds, text } };
}

export function isValidVersion(text) {
  return Boolean(parseVersion(text).version);
}

// Two numbers without leading zeros, as strings: the longer one is larger, then digit by digit.
function compareNumbers(a, b) {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareIdentifiers(a, b) {
  const an = DIGITS.test(a);
  const bn = DIGITS.test(b);
  if (an && bn) return compareNumbers(a, b); // item 11.4.1: numeric identifiers compare numerically
  if (an) return -1; // item 11.4.3: numeric identifiers have lower precedence than alphanumeric ones
  if (bn) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1; // item 11.4.2: alphanumeric identifiers compare in ASCII order
}

export function compareCores(a, b) {
  return compareNumbers(a.major, b.major) || compareNumbers(a.minor, b.minor) || compareNumbers(a.patch, b.patch);
}

// Precedence as item 11 defines it: -1 when a comes before b, 0 when equal, 1 when after.
// Build metadata is ignored (item 10).
export function compareVersions(a, b) {
  const core = compareCores(a, b); // item 11.2
  if (core) return core;
  const ap = a.prerelease;
  const bp = b.prerelease;
  if (!ap.length && !bp.length) return 0;
  if (!ap.length) return 1; // item 11.3: a pre-release version has lower precedence than the normal version
  if (!bp.length) return -1;
  for (let i = 0; i < Math.min(ap.length, bp.length); i += 1) {
    const c = compareIdentifiers(ap[i], bp[i]);
    if (c) return c;
  }
  if (ap.length === bp.length) return 0;
  return ap.length < bp.length ? -1 : 1; // item 11.4.4: a larger set of identifiers has higher precedence
}

// Which part of the version core changed first: major, minor, patch, or none when the cores are equal.
export function bumpKind(from, to) {
  if (from.major !== to.major) return 'major';
  if (from.minor !== to.minor) return 'minor';
  if (from.patch !== to.patch) return 'patch';
  return 'none';
}

function increment(n) {
  return (BigInt(n) + 1n).toString();
}

export function formatCore(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

// The next normal version after v for a bump kind (items 6, 7 and 8).
export function nextVersion(v, kind) {
  if (kind === 'major') return `${increment(v.major)}.0.0`;
  if (kind === 'minor') return `${v.major}.${increment(v.minor)}.0`;
  if (kind === 'patch') return `${v.major}.${v.minor}.${increment(v.patch)}`;
  return formatCore(v);
}

export function maxBump(a, b) {
  return BUMP_RANK[a] >= BUMP_RANK[b] ? a : b;
}
