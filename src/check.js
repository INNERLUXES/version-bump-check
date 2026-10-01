// Checks that a release's version number matches the commits in it.
// docs/method.md gives the SemVer and Conventional Commits item behind every finding.

import { parseVersion, compareVersions, bumpKind, nextVersion, formatCore, BUMP_RANK, maxBump } from './semver.js';
import { parseCommit, classifyCommit, buildTypes } from './commits.js';

export const SEVERITIES = ['error', 'warning', 'info'];
export const RANK = { error: 0, warning: 1, info: 2 };

export const FINDINGS = [
  { id: 'version-invalid', severity: 'error', what: 'A version is not valid SemVer 2.0.0: leading zeros, a missing part, a bad pre-release or build identifier' },
  { id: 'not-increasing', severity: 'error', what: 'The new version is not higher than the previous one by SemVer precedence' },
  { id: 'bump-too-small', severity: 'error', what: 'The commits need a larger bump, such as a breaking change in a minor release' },
  { id: 'bump-too-large', severity: 'warning / info', what: 'The bump is larger than the commits need, such as only fixes in a major release; info with --allow-larger' },
  { id: 'skipped-version', severity: 'warning', what: 'The new version is not the next one for its bump, such as 1.4.2 to 1.6.0' },
  { id: 'unparsed-commit', severity: 'info / error', what: 'Commit messages not in Conventional Commits form, counted and listed by first line; error with --strict' },
  { id: 'pre-release', severity: 'info', what: 'A version is a pre-release; how that changes the check' }
];

export function isFindingId(id) {
  return FINDINGS.some((f) => f.id === id);
}

// Text from the input: control and direction characters removed and length capped, so it cannot rewrite a terminal.
export function safeText(value, max = 200) {
  const s = String(value).replace(/[\u0000-\u001f\u007f-\u009f\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g, ' ');
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

export function meetsThreshold(severity, failOn) {
  return RANK[severity] <= RANK[failOn];
}

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function quoteList(lines, max = 5) {
  const shown = lines.slice(0, max).map((l) => `"${l}"`).join(', ');
  return lines.length > max ? `${shown} and ${lines.length - max} more` : shown;
}

const WHY = {
  major: (c) => `${plural(c.major, 'breaking change')}`,
  minor: (c) => `${plural(c.minor, 'new feature')}`,
  patch: (c) => `${plural(c.patch, 'fix', 'fixes')}`,
  none: () => 'no feature, fix or breaking change'
};

// Checks one release.
//   from, to   the previous and the new version, as text
//   messages   the commit messages since the previous release, or null when none were given
//   options    strict, allowLarger, zeroMajorStrict, minorTypes, patchTypes, failOn, toSource, notes
export function checkRelease(from, to, messages, options = {}) {
  const o = { strict: false, allowLarger: false, zeroMajorStrict: false, minorTypes: [], patchTypes: [], failOn: 'error', notes: [], ...options };
  const types = buildTypes(o.minorTypes, o.patchTypes);
  const findings = [];
  const notes = [...o.notes];
  const add = (id, severity, message) => findings.push({ id, severity, message: safeText(message, 600) });

  // Commits: only the first line of each message is kept; the body never leaves this loop.
  const commits = [];
  const counts = { total: 0, major: 0, minor: 0, patch: 0, none: 0, unknown: 0 };
  const unparsed = [];
  const wrongCase = [];
  const drivers = { major: [], minor: [], patch: [] };
  for (const message of messages || []) {
    const c = parseCommit(message);
    const effect = classifyCommit(c, types);
    const firstLine = safeText(c.firstLine) || '(empty first line)';
    commits.push({ firstLine, type: c.type === null ? null : safeText(c.type, 40), scope: c.scope === null ? null : safeText(c.scope, 60), breaking: c.breaking, effect });
    counts.total += 1;
    counts[effect] += 1;
    if (effect === 'unknown') unparsed.push(firstLine);
    if (drivers[effect]) drivers[effect].push(firstLine);
    if (c.breakingWrongCase) wrongCase.push(firstLine);
  }

  let required = null;
  if (messages) {
    required = 'none';
    for (const c of commits) if (c.effect !== 'unknown') required = maxBump(required, c.effect);
    if (!messages.length) notes.push('the commit file holds no messages; a release without changes needs no new version');
  } else {
    notes.push('no commit messages given (--commits); only the version numbers were checked');
  }

  if (unparsed.length) {
    add('unparsed-commit', o.strict ? 'error' : 'info',
      `${plural(unparsed.length, 'commit message')} not in Conventional Commits form, so ${unparsed.length === 1 ? 'its' : 'their'} effect is unknown and not counted: ${quoteList(unparsed)}`);
  }
  if (wrongCase.length) {
    notes.push(`a "breaking change:" line not in upper case is not a breaking change in Conventional Commits (item 15); check ${quoteList(wrongCase, 3)}`);
  }

  const fromP = parseVersion(from);
  const toP = parseVersion(to);
  const shown = (t) => (typeof t === 'string' ? safeText(t, 80) : '');
  if (fromP.error) add('version-invalid', 'error', `previous version "${shown(from)}" is not valid SemVer 2.0.0: ${fromP.error}`);
  if (toP.error) add('version-invalid', 'error', `new version "${shown(to)}" is not valid SemVer 2.0.0: ${toP.error}`);

  const bump = { actual: null, required, smallest: null };
  const fromV = fromP.version;
  const toV = toP.version;

  if (fromV && required === 'major' && fromV.major === '0' && !o.zeroMajorStrict) {
    bump.required = 'minor';
    notes.push('the previous version is 0.y.z, where anything may change (SemVer item 4); here a breaking change needs at least a minor bump. --zero-major-strict asks for 1.0.0 instead');
  }

  if (fromV && toV) {
    const order = compareVersions(toV, fromV);
    if (order <= 0) {
      const sameButBuild = order === 0 && toV.text !== fromV.text;
      add('not-increasing', 'error', sameButBuild
        ? `${shown(to)} and ${shown(from)} differ only in build metadata, which does not count for precedence (SemVer item 10); the new version must be higher`
        : order === 0
          ? `the new version ${shown(to)} is the same as the previous one`
          : `the new version ${shown(to)} is lower than the previous one ${shown(from)} by SemVer precedence (item 11)`);
    } else {
      const fromPre = fromV.prerelease.length > 0;
      const actual = bumpKind(fromV, toV);
      if (toV.prerelease.length) {
        add('pre-release', 'info', `${shown(to)} is a pre-release: it comes before ${formatCore(toV)} (SemVer item 11) and may not be stable (item 9); the bump is checked on its version core ${formatCore(toV)}`);
      }
      if (fromPre && actual === 'none') {
        add('pre-release', 'info', `${shown(from)} -> ${shown(to)} stays on version core ${formatCore(toV)}, so the bump size cannot be measured; run with --from set to the last normal release to check the whole release`);
      } else {
        if (fromPre) add('pre-release', 'info', `the previous version ${shown(from)} is a pre-release; the bump is measured from its version core ${formatCore(fromV)}, and skipped versions are not checked`);
        bump.actual = actual;
        const leavingZero = fromV.major === '0' && actual === 'major';
        if (leavingZero) notes.push(`${formatCore(toV)} leaves 0.y.z and defines the public API (SemVer item 5); a major bump is never too large here`);
        if (bump.required !== null) {
          const need = maxBump(bump.required, 'patch');
          if (!fromPre) bump.smallest = nextVersion(fromV, need);
          const because = bump.required === 'none' ? WHY.none() : `${WHY[required](counts)}${bump.required !== required ? ' in 0.y.z' : ''}`;
          const examples = drivers[required] && drivers[required].length ? `: ${quoteList(drivers[required], 3)}` : '';
          if (BUMP_RANK[actual] < BUMP_RANK[bump.required]) {
            add('bump-too-small', 'error', `the commits need a ${bump.required} bump (${because}${examples}), but ${shown(from)} -> ${shown(to)} is a ${actual} bump${bump.smallest ? `; the smallest correct version is ${bump.smallest}` : ''}`);
          } else if (BUMP_RANK[actual] > BUMP_RANK[need] && !leavingZero) {
            add('bump-too-large', o.allowLarger ? 'info' : 'warning', `${shown(from)} -> ${shown(to)} is a ${actual} bump, but the commits need only a ${need} bump (${because})${bump.smallest ? `; ${bump.smallest} would do` : ''}. Pass --allow-larger when the larger bump is on purpose`);
          }
        }
        if (!fromPre && actual !== 'none') {
          const expected = nextVersion(fromV, actual);
          if (formatCore(toV) !== expected) {
            add('skipped-version', 'warning', `${shown(from)} -> ${shown(to)} skips ${expected}, the next ${actual} version (SemVer items 6, 7 and 8 reset the lower numbers to 0)`);
          }
        }
      }
    }
  }

  findings.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const findingCounts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) findingCounts[f.severity] += 1;
  const failing = findings.filter((f) => meetsThreshold(f.severity, o.failOn));
  const errors = failing.filter((f) => f.severity === 'error').length;
  const warnings = failing.length - errors;
  const reason = [errors ? plural(errors, 'error') : '', warnings ? plural(warnings, 'warning') : ''].filter(Boolean).join(' and ');

  return {
    tool: 'version-bump-check',
    from: { text: shown(from), valid: Boolean(fromV) },
    to: { text: shown(to), valid: Boolean(toV), source: o.toSource ? safeText(o.toSource, 300) : null },
    bump,
    commitCounts: counts,
    commits,
    counts: findingCounts,
    findings,
    notes: notes.map((n) => safeText(n, 600)),
    gate: { failOn: o.failOn, pass: failing.length === 0, reason: failing.length ? reason : '' }
  };
}
