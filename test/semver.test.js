import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, isValidVersion, compareVersions, compareCores, bumpKind, nextVersion, formatCore, maxBump, BUMPS, BUMP_RANK, MAX_VERSION_LENGTH } from '../src/index.js';

const v = (text) => {
  const r = parseVersion(text);
  assert.ok(r.version, `${text}: ${r.error}`);
  return r.version;
};
const cmp = (a, b) => compareVersions(v(a), v(b));

// The regular expression suggested on semver.org, used here only to cross-check the parser.
const OFFICIAL = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

test('valid versions are read into core, pre-release and build parts', () => {
  assert.deepEqual(v('1.4.2'), { major: '1', minor: '4', patch: '2', prerelease: [], build: [], text: '1.4.2' });
  const full = v('1.0.0-alpha.1+exp.sha.5114f85');
  assert.deepEqual(full.prerelease, ['alpha', '1']);
  assert.deepEqual(full.build, ['exp', 'sha', '5114f85']);
  // Examples from items 9 and 10.
  for (const ok of ['1.0.0-alpha', '1.0.0-0.3.7', '1.0.0-x.7.z.92', '1.0.0-x-y-z.--', '1.0.0-alpha+001', '1.0.0+20130313144700', '1.0.0-beta+exp.sha.5114f85', '1.0.0+21AF26D3----117B344092BD', '0.0.0']) {
    assert.ok(isValidVersion(ok), ok);
    assert.ok(OFFICIAL.test(ok), ok);
  }
  // Numbers past what a JavaScript number holds exactly are kept as text.
  assert.equal(v('99999999999999999999.0.0').major, '99999999999999999999');
});

test('invalid versions are refused with the reason and the SemVer item', () => {
  const cases = [
    ['01.2.3', /MAJOR 01 has a leading zero \(item 2\)/],
    ['1.02.3', /MINOR 02 has a leading zero/],
    ['1.2.03', /PATCH 03 has a leading zero/],
    ['1.2', /three numbers/],
    ['1.2.3.4', /three numbers/],
    ['1.2.x', /three numbers/],
    ['v1.2.3', /starts with "v": that is a tag name/],
    ['1.2.3-', /nothing after "-"/],
    ['1.2.3-alpha..1', /empty pre-release identifier \(item 9\)/],
    ['1.2.3-01', /numeric pre-release identifier "01" has a leading zero/],
    ['1.2.3-alpha_beta', /character other than ASCII letters/],
    ['1.2.3+', /nothing after "\+"/],
    ['1.2.3+a..b', /empty build metadata identifier \(item 10\)/],
    ['1.2.3+a+b', /build metadata identifier "a\+b"/],
    [' 1.2.3', /spaces/],
    ['', /empty/]
  ];
  for (const [text, reason] of cases) {
    const r = parseVersion(text);
    assert.equal(r.version, undefined, text);
    assert.match(r.error, reason, text);
    assert.ok(!OFFICIAL.test(text), text);
  }
  assert.match(parseVersion(undefined).error, /no version/);
  assert.match(parseVersion(`1.0.0-${'a'.repeat(MAX_VERSION_LENGTH)}`).error, /longer than 256 characters/);
  // Build identifiers may have leading zeros (item 10 example 1.0.0-alpha+001).
  assert.ok(isValidVersion('1.0.0+001'));
});

test('precedence follows the chain of item 11', () => {
  // item 11 example: 1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0
  const chain = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  for (let i = 0; i < chain.length - 1; i += 1) {
    assert.equal(cmp(chain[i], chain[i + 1]), -1, `${chain[i]} < ${chain[i + 1]}`);
    assert.equal(cmp(chain[i + 1], chain[i]), 1, `${chain[i + 1]} > ${chain[i]}`);
  }
  // A shuffled copy sorts back into the same order.
  const shuffled = [chain[5], chain[0], chain[7], chain[3], chain[1], chain[6], chain[2], chain[4]];
  assert.deepEqual(shuffled.map(v).sort(compareVersions).map((x) => x.text), chain);
});

test('precedence compares the core numerically and ignores build metadata', () => {
  // item 11.2 example: 1.0.0 < 2.0.0 < 2.1.0 < 2.1.1
  assert.equal(cmp('1.0.0', '2.0.0'), -1);
  assert.equal(cmp('2.0.0', '2.1.0'), -1);
  assert.equal(cmp('2.1.0', '2.1.1'), -1);
  assert.equal(cmp('1.10.0', '1.9.0'), 1);
  assert.equal(cmp('100000000000000000000.0.0', '99999999999999999999.0.0'), 1);
  // item 11.3 example: 1.0.0-alpha < 1.0.0
  assert.equal(cmp('1.0.0-alpha', '1.0.0'), -1);
  // item 10: build metadata does not count
  assert.equal(cmp('1.0.0+a', '1.0.0+b'), 0);
  assert.equal(cmp('1.0.0-rc.1+build.1', '1.0.0-rc.1'), 0);
  // numeric identifiers sort before alphanumeric ones, and numerically among themselves
  assert.equal(cmp('1.0.0-1', '1.0.0-a'), -1);
  assert.equal(cmp('1.0.0-2', '1.0.0-10'), -1);
  assert.equal(cmp('1.0.0-B', '1.0.0-a'), -1);
  assert.equal(compareCores(v('1.2.3-a'), v('1.2.3')), 0);
});

test('bump kinds and next versions', () => {
  assert.equal(bumpKind(v('1.4.2'), v('2.0.0')), 'major');
  assert.equal(bumpKind(v('1.4.2'), v('1.5.0')), 'minor');
  assert.equal(bumpKind(v('1.4.2'), v('1.4.3')), 'patch');
  assert.equal(bumpKind(v('1.5.0-rc.1'), v('1.5.0')), 'none');
  assert.equal(nextVersion(v('1.4.2'), 'major'), '2.0.0');
  assert.equal(nextVersion(v('1.4.2'), 'minor'), '1.5.0');
  assert.equal(nextVersion(v('1.4.2'), 'patch'), '1.4.3');
  assert.equal(nextVersion(v('1.4.2'), 'none'), '1.4.2');
  assert.equal(nextVersion(v('1.9.99999999999999999999'), 'patch'), '1.9.100000000000000000000');
  assert.equal(formatCore(v('3.2.1-rc.1+b')), '3.2.1');
  assert.deepEqual(BUMPS, ['none', 'patch', 'minor', 'major']);
  assert.equal(maxBump('patch', 'minor'), 'minor');
  assert.equal(maxBump('major', 'none'), 'major');
  assert.ok(BUMP_RANK.major > BUMP_RANK.minor);
});
