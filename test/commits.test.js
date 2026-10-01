import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseCommit, parseFooters, classifyCommit, buildTypes, splitMessages, loadCommits, LIMITS, LONG_LINE, SEPARATORS, DEFAULT_TYPES } from '../src/index.js';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const at = (p) => join(root, p);

test('a header gives type, scope and description; types are not case sensitive', () => {
  const c = parseCommit('feat(orders): filter the order list by status');
  assert.equal(c.parsed, true);
  assert.equal(c.type, 'feat');
  assert.equal(c.scope, 'orders');
  assert.equal(c.breaking, false);
  assert.equal(c.firstLine, 'feat(orders): filter the order list by status');
  assert.equal(parseCommit('docs: correct spelling of CHANGELOG').scope, null);
  assert.equal(parseCommit('FIX: lower case is not required').type, 'fix');
  assert.equal(parseCommit('feat(api client): a scope with a space').scope, 'api client');
});

test('messages that are not in Conventional Commits form are not parsed', () => {
  for (const m of ['Update README', 'feat:missing space', 'feat: ', 'feat():  empty scope', 'feat(a)(b): two scopes', ': no type', 'fixup! feat: x', 'Merge branch main into release', 'Revert "feat: x"', '']) {
    assert.equal(parseCommit(m).parsed, false, m);
    assert.equal(classifyCommit(parseCommit(m)), 'unknown', m);
  }
});

test('"!" before the colon marks a breaking change, with or without a scope', () => {
  const a = parseCommit('feat!: send an email to the customer when a product is shipped');
  assert.equal(a.breaking, true);
  assert.equal(a.breakingFrom, 'header');
  const b = parseCommit('refactor(api)!: rename total to amount');
  assert.equal(b.breaking, true);
  assert.equal(b.scope, 'api');
  assert.equal(classifyCommit(b), 'major');
  assert.equal(parseCommit('chore!: drop support for Node 20').breaking, true);
});

test('BREAKING CHANGE and BREAKING-CHANGE footers mark a breaking change; lower case does not', () => {
  const msg = 'feat: allow provided config object to extend other configs\n\nBREAKING CHANGE: `extends` key in config file is now used for extending other config files';
  const a = parseCommit(msg);
  assert.equal(a.breaking, true);
  assert.equal(a.breakingFrom, 'footer');
  assert.deepEqual(a.footers, ['BREAKING CHANGE']);
  const b = parseCommit('fix: x\n\nBREAKING-CHANGE: y');
  assert.equal(b.breaking, true);
  assert.equal(classifyCommit(b), 'major');
  const lower = parseCommit('fix: x\n\nbreaking change: y');
  assert.equal(lower.breaking, false);
  assert.equal(lower.breakingWrongCase, true);
  assert.equal(parseCommit('fix: x\n\nThis is a BREAKING CHANGE: maybe').breaking, false);
  // A breaking line in the subject itself is only a description.
  assert.equal(parseCommit('fix: BREAKING CHANGE: in the subject').breaking, false);
});

test('multi-line bodies and several footers are read; only the last paragraph holds footers', () => {
  const msg = [
    'fix(orders): prevent racing of requests',
    '',
    'Introduce a request id and a reference to the latest request. Dismiss',
    'incoming responses other than from the latest request.',
    '',
    'Remove timeouts which were used to mitigate the racing issue but are',
    'obsolete now.',
    '',
    'Reviewed-by: Z',
    'Refs: #123'
  ].join('\n');
  const c = parseCommit(msg);
  assert.equal(c.parsed, true);
  assert.equal(c.breaking, false);
  assert.deepEqual(c.footers, ['Reviewed-by', 'Refs']);
  assert.equal(c.firstLine, 'fix(orders): prevent racing of requests');
  assert.deepEqual(parseFooters(['body text', '', 'Closes #12', 'BREAKING CHANGE: gone']), ['Closes', 'BREAKING CHANGE']);
  assert.deepEqual(parseFooters(['just a body', 'over two lines']), []);
  // A footer value may run over several lines; the BREAKING CHANGE line still counts.
  const long = parseCommit('feat: x\n\nBREAKING CHANGE: the field\n  total is now amount\nRefs: #9');
  assert.equal(long.breaking, true);
  assert.deepEqual(long.footers, ['BREAKING CHANGE', 'Refs']);
});

test('effects: feat is minor, fix and perf are patch, other types none, extra types by option', () => {
  assert.deepEqual(DEFAULT_TYPES, { minor: ['feat'], patch: ['fix', 'perf'] });
  const effect = (m, types) => classifyCommit(parseCommit(m), types);
  assert.equal(effect('feat: a'), 'minor');
  assert.equal(effect('fix: a'), 'patch');
  assert.equal(effect('perf: a'), 'patch');
  for (const t of ['docs', 'chore', 'test', 'ci', 'build', 'refactor', 'style']) assert.equal(effect(`${t}: a`), 'none', t);
  for (const t of ['docs', 'chore', 'test', 'ci', 'build', 'refactor', 'style']) assert.equal(effect(`${t}!: a`), 'major', t);
  const types = buildTypes(['deprecate', 'Security'], ['deps']);
  assert.equal(effect('deprecate: old endpoint', types), 'minor');
  assert.equal(effect('security: escape names', types), 'minor');
  assert.equal(effect('deps: update', types), 'patch');
  assert.throws(() => buildTypes([], ['feat']), /cannot need both a minor and a patch bump/);
  assert.throws(() => buildTypes(['no spaces'], []), /--minor-types: "no spaces" is not a commit type/);
});

test('NUL-separated files split like git log --format=%B%x00 writes them', () => {
  const text = 'feat: a\n\nbody\n\0\nfix: b\r\n\0\n\0\n  \n';
  const r = splitMessages(text, 'nul');
  assert.deepEqual(r.messages, ['feat: a\n\nbody', 'fix: b']);
  assert.equal(r.longLines, 0);
  assert.equal(r.noSeparator, false);
  assert.equal(splitMessages('feat: a\n\nfix: b\n', 'nul').noSeparator, true);
  assert.deepEqual(SEPARATORS, ['nul', 'blank']);
  assert.throws(() => splitMessages('', 'comma'), /unknown separator comma/);
});

test('blank-line separated files give one message per block', () => {
  const r = splitMessages('feat: a\nBREAKING CHANGE: b\n\n\nfix: c\n \ndocs: d\n', 'blank');
  assert.deepEqual(r.messages, ['feat: a\nBREAKING CHANGE: b', 'fix: c', 'docs: d']);
  assert.equal(parseCommit(r.messages[0]).breaking, true);
});

test('size limits: file size, number of commits, line length', async () => {
  assert.equal(LIMITS.maxFileBytes, 20 * 1024 * 1024);
  assert.equal(LIMITS.maxCommits, 50000);
  assert.equal(LIMITS.maxLineBytes, 16 * 1024);
  await assert.rejects(loadCommits(at('examples/commits-minor.txt'), 'nul', { ...LIMITS, maxFileBytes: 100 }), /bytes is over the 0\.\d+ MB limit/);
  await assert.rejects(loadCommits(at('examples')), /not a file/);
  await assert.rejects(loadCommits(at('examples/none.txt')), { code: 'ENOENT' });
  const many = 'fix: a\0'.repeat(50001);
  assert.throws(() => splitMessages(many, 'nul'), /more than 50,000 commit messages, which is over the limit/);
  assert.equal(splitMessages('fix: a\0'.repeat(50000), 'nul').messages.length, 50000);
  const long = splitMessages(`feat: a\n\n${'x'.repeat(17 * 1024)}\0${'y'.repeat(17 * 1024)}\nmore\0`, 'nul');
  assert.equal(long.longLines, 2);
  assert.equal(long.messages[0], `feat: a\n\n${LONG_LINE}`);
  assert.equal(parseCommit(long.messages[1]).parsed, false);
  assert.equal(parseCommit(long.messages[1]).firstLine, LONG_LINE);
  const loaded = await loadCommits(at('examples/commits-breaking.txt'));
  assert.equal(loaded.messages.length, 6);
});
