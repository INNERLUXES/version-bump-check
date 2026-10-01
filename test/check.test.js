import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease, FINDINGS, SEVERITIES, RANK, isFindingId, safeText, meetsThreshold } from '../src/index.js';

const ids = (r) => r.findings.map((f) => f.id);
const find = (r, id) => r.findings.filter((f) => f.id === id);

test('every finding has an id and known severities, and the list is complete', () => {
  assert.deepEqual(FINDINGS.map((f) => f.id), ['version-invalid', 'not-increasing', 'bump-too-small', 'bump-too-large', 'skipped-version', 'unparsed-commit', 'pre-release']);
  for (const f of FINDINGS) for (const s of f.severity.split(' / ')) assert.ok(SEVERITIES.includes(s), f.id);
  assert.ok(isFindingId('bump-too-small'));
  assert.ok(!isFindingId('nothing'));
  assert.ok(RANK.error < RANK.warning && RANK.warning < RANK.info);
  assert.ok(meetsThreshold('error', 'warning'));
  assert.ok(meetsThreshold('warning', 'warning'));
  assert.ok(!meetsThreshold('warning', 'error'));
  assert.ok(!meetsThreshold('info', 'warning'));
});

test('a minor release with features and fixes passes', () => {
  const r = checkRelease('1.4.2', '1.5.0', ['feat: a', 'fix: b', 'docs: c']);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.bump, { actual: 'minor', required: 'minor', smallest: '1.5.0' });
  assert.equal(r.gate.pass, true);
  assert.deepEqual(r.commitCounts, { total: 3, major: 0, minor: 1, patch: 1, none: 1, unknown: 0 });
});

test('version-invalid: each invalid version is an error, and the bump is not measured', () => {
  const r = checkRelease('1.4', 'v2.0.0', ['feat: a']);
  assert.deepEqual(ids(r), ['version-invalid', 'version-invalid']);
  assert.match(r.findings[0].message, /previous version "1.4" is not valid SemVer 2.0.0: the version core must be three numbers/);
  assert.match(r.findings[1].message, /new version "v2.0.0" .* tag name/);
  assert.equal(r.bump.actual, null);
  assert.equal(r.gate.pass, false);
  assert.equal(r.from.valid, false);
});

test('not-increasing: lower, equal, or only build metadata changed', () => {
  assert.match(find(checkRelease('1.4.2', '1.4.1', []), 'not-increasing')[0].message, /lower than the previous one 1.4.2 by SemVer precedence/);
  assert.match(find(checkRelease('1.4.2', '1.4.2', []), 'not-increasing')[0].message, /the same as the previous one/);
  assert.match(find(checkRelease('1.4.2', '1.4.2+build.7', []), 'not-increasing')[0].message, /differ only in build metadata/);
  // A pre-release of the same core comes before the normal version.
  assert.equal(find(checkRelease('1.5.0', '1.5.0-rc.1', []), 'not-increasing')[0].severity, 'error');
  assert.equal(find(checkRelease('1.0.0-beta.11', '1.0.0-beta.2', []), 'not-increasing').length, 1);
});

test('bump-too-small: a breaking change in a minor release, a feature in a patch release', () => {
  const r = checkRelease('1.4.2', '1.5.0', ['feat: a', 'refactor(api)!: rename total to amount', 'fix: b\n\nBREAKING CHANGE: c']);
  const f = find(r, 'bump-too-small')[0];
  assert.equal(f.severity, 'error');
  assert.match(f.message, /need a major bump \(2 breaking changes: "refactor\(api\)!: rename total to amount", "fix: b"\), but 1.4.2 -> 1.5.0 is a minor bump; the smallest correct version is 2.0.0/);
  assert.equal(r.bump.smallest, '2.0.0');
  const p = checkRelease('1.4.2', '1.4.3', ['fix: a', 'feat: b']);
  assert.match(find(p, 'bump-too-small')[0].message, /minor bump \(1 new feature: "feat: b"\).*smallest correct version is 1.5.0/);
});

test('bump-too-large: a warning, or info with --allow-larger; a patch release is never too large', () => {
  const r = checkRelease('1.4.2', '2.0.0', ['fix: a', 'docs: b']);
  assert.equal(find(r, 'bump-too-large')[0].severity, 'warning');
  assert.match(find(r, 'bump-too-large')[0].message, /major bump, but the commits need only a patch bump \(1 fix\); 1.4.3 would do/);
  assert.equal(r.gate.pass, true);
  assert.equal(checkRelease('1.4.2', '2.0.0', ['fix: a'], { failOn: 'warning' }).gate.pass, false);
  assert.equal(find(checkRelease('1.4.2', '2.0.0', ['fix: a'], { allowLarger: true }), 'bump-too-large')[0].severity, 'info');
  assert.equal(checkRelease('1.4.2', '2.0.0', ['fix: a'], { allowLarger: true, failOn: 'warning' }).gate.pass, true);
  // Only docs and chores: the smallest possible release is a patch release.
  assert.deepEqual(ids(checkRelease('1.4.2', '1.4.3', ['docs: a', 'chore: b'])), []);
  assert.match(find(checkRelease('1.4.2', '1.5.0', ['docs: a']), 'bump-too-large')[0].message, /no feature, fix or breaking change/);
});

test('skipped-version: the new version is not the next one for its bump', () => {
  assert.match(find(checkRelease('1.4.2', '1.6.0', ['feat: a']), 'skipped-version')[0].message, /1.4.2 -> 1.6.0 skips 1.5.0, the next minor version/);
  assert.match(find(checkRelease('1.4.2', '1.4.4', ['fix: a']), 'skipped-version')[0].message, /skips 1.4.3/);
  assert.match(find(checkRelease('1.4.2', '1.5.1', ['feat: a']), 'skipped-version')[0].message, /skips 1.5.0/);
  assert.match(find(checkRelease('1.4.2', '2.1.0', ['feat!: a']), 'skipped-version')[0].message, /skips 2.0.0/);
  assert.equal(find(checkRelease('1.4.2', '2.0.0', ['feat!: a']), 'skipped-version').length, 0);
  assert.equal(find(checkRelease('1.4.2', '1.5.0+build.3', ['feat: a']), 'skipped-version').length, 0);
});

test('0.y.z: a breaking change needs at least a minor bump, or 1.0.0 with --zero-major-strict', () => {
  const ok = checkRelease('0.9.1', '0.10.0', ['feat!: a']);
  assert.deepEqual(ids(ok), []);
  assert.equal(ok.bump.required, 'minor');
  assert.ok(ok.notes.some((n) => /SemVer item 4/.test(n)));
  const patch = checkRelease('0.9.1', '0.9.2', ['feat!: a']);
  assert.match(find(patch, 'bump-too-small')[0].message, /need a minor bump \(1 breaking change in 0.y.z: "feat!: a"\).*0.10.0/);
  const strict = checkRelease('0.9.1', '0.10.0', ['feat!: a'], { zeroMajorStrict: true });
  assert.match(find(strict, 'bump-too-small')[0].message, /need a major bump.*smallest correct version is 1.0.0/);
  assert.deepEqual(ids(checkRelease('0.9.1', '1.0.0', ['feat!: a'], { zeroMajorStrict: true })), []);
  // Leaving 0.y.z for 1.0.0 is never too large (SemVer item 5).
  const leave = checkRelease('0.9.1', '1.0.0', ['fix: a']);
  assert.equal(find(leave, 'bump-too-large').length, 0);
  assert.ok(leave.notes.some((n) => /SemVer item 5/.test(n)));
  // Features in 0.y.z still need a minor bump.
  assert.equal(find(checkRelease('0.9.1', '0.9.2', ['feat: a']), 'bump-too-small').length, 1);
});

test('unparsed-commit: counted, listed by first line, info by default and an error with --strict', () => {
  const messages = ['feat: a', 'Update README\n\nsecret body text', 'wip', 'x', 'y', 'z', 'w'];
  const r = checkRelease('1.4.2', '1.5.0', messages);
  const f = find(r, 'unparsed-commit')[0];
  assert.equal(f.severity, 'info');
  assert.match(f.message, /^6 commit messages not in Conventional Commits form, so their effect is unknown and not counted: "Update README", "wip", "x", "y", "z" and 1 more$/);
  assert.equal(r.gate.pass, true);
  assert.equal(r.commitCounts.unknown, 6);
  const strict = checkRelease('1.4.2', '1.5.0', messages, { strict: true });
  assert.equal(find(strict, 'unparsed-commit')[0].severity, 'error');
  assert.equal(strict.gate.pass, false);
  assert.ok(!JSON.stringify(r).includes('secret body text'));
});

test('pre-release notes: a pre-release target, and a pre-release starting point', () => {
  const to = checkRelease('1.4.2', '2.0.0-rc.1', ['feat!: a']);
  assert.deepEqual(ids(to), ['pre-release']);
  assert.match(to.findings[0].message, /2.0.0-rc.1 is a pre-release: it comes before 2.0.0/);
  const same = checkRelease('2.0.0-rc.1', '2.0.0', ['fix: a']);
  assert.deepEqual(ids(same), ['pre-release']);
  assert.match(same.findings[0].message, /bump size cannot be measured; run with --from set to the last normal release/);
  assert.equal(same.bump.actual, null);
  const next = checkRelease('2.0.0-rc.1', '2.1.0', ['feat: a']);
  assert.deepEqual(ids(next), ['pre-release']);
  assert.match(next.findings[0].message, /measured from its version core 2.0.0, and skipped versions are not checked/);
  assert.equal(next.bump.smallest, null);
});

test('without commit messages only the version numbers are checked', () => {
  const r = checkRelease('1.4.2', '3.0.0', null);
  assert.deepEqual(ids(r), ['skipped-version']);
  assert.equal(r.bump.required, null);
  assert.ok(r.notes.some((n) => /no commit messages given/.test(n)));
  const empty = checkRelease('1.4.2', '1.4.3', []);
  assert.ok(empty.notes.some((n) => /holds no messages/.test(n)));
  assert.equal(empty.bump.required, 'none');
});

test('findings are sorted by severity, and the gate reason counts them', () => {
  const r = checkRelease('1.4.2', '1.6.0', ['feat!: a', 'wip'], { failOn: 'warning' });
  assert.deepEqual(ids(r), ['bump-too-small', 'skipped-version', 'unparsed-commit']);
  assert.equal(r.gate.reason, '1 error and 1 warning');
  assert.deepEqual(r.counts, { error: 1, warning: 1, info: 1 });
});

test('control characters are removed from everything shown', () => {
  assert.equal(safeText('a\u001b[31mb\u0007c'), 'a [31mb c');
  assert.equal(safeText('x'.repeat(300)).length, 200);
  const r = checkRelease('1.4.2\u001b[2J', '1.5.0', ['feat(\u001b]0;x): a\u202eb']);
  const all = JSON.stringify(r);
  assert.ok(!/[\u0000-\u001f\u202e]/.test(r.findings[0].message + r.commits[0].firstLine + (r.commits[0].scope || '')));
  assert.ok(!all.includes('\\u001b'));
});
