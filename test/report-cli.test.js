import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseArgs, main, readPackageVersion, checkRelease, toText, toMarkdown, toJson, toCsv, csvCell, mdCell, USAGE, VERSION, LIMITS } from '../src/index.js';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const at = (p) => join(root, p);
const quiet = { out: () => {}, err: () => {} };

async function capture(argv) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } });
  return { code, out, err };
}

const breaking = ['--from', '1.4.2', '--package', at('examples/package.json'), '--commits', at('examples/commits-breaking.txt')];
const minor = ['--from', '1.4.2', '--package', at('examples/package.json'), '--commits', at('examples/commits-minor.txt')];

// A report with text that tries to break each format.
function hostile() {
  return checkRelease('1.4.2', '1.5.0', ['feat(a|b): =cmd|x, "quoted"', '@sum(1)', '-1 wip']);
}

test('parseArgs reads options and refuses bad input', () => {
  const o = parseArgs(['--from', '1.4.2', '--to', '1.5.0', '--commits', 'c.txt', '--separator', 'blank', '--format', 'csv', '--fail-on', 'warning',
    '--strict', '--allow-larger', '--zero-major-strict', '--minor-types', 'deprecate', '--patch-types', 'deps,security', '--patch-types', 'i18n']);
  assert.equal(o.from, '1.4.2');
  assert.equal(o.to, '1.5.0');
  assert.equal(o.commits, 'c.txt');
  assert.equal(o.separator, 'blank');
  assert.equal(o.format, 'csv');
  assert.equal(o.failOn, 'warning');
  assert.ok(o.strict && o.allowLarger && o.zeroMajorStrict);
  assert.deepEqual(o.minorTypes, ['deprecate']);
  assert.deepEqual(o.patchTypes, ['deps', 'security', 'i18n']);
  const d = parseArgs(['--from', '1.0.0', '--package', 'package.json']);
  assert.equal(d.failOn, 'error');
  assert.equal(d.separator, 'nul');
  assert.equal(d.format, 'text');
  assert.throws(() => parseArgs(['--to', '1.0.0']), /give the previous version with --from/);
  assert.throws(() => parseArgs(['--from', '1.0.0']), /--to or --package/);
  assert.throws(() => parseArgs(['--from', '1.0.0', '--to', '1.1.0', '--package', 'p.json']), /not both/);
  assert.throws(() => parseArgs(['--from', '1.0.0', '--to', '1.1.0', '--format', 'xml']), /unknown format xml/);
  assert.throws(() => parseArgs(['--from', '1.0.0', '--to', '1.1.0', '--fail-on', 'info']), /error or warning/);
  assert.throws(() => parseArgs(['--from', '1.0.0', '--to', '1.1.0', '--separator', 'comma', '--commits', 'c']), /unknown separator comma/);
  assert.throws(() => parseArgs(['--from', '1.0.0', '--to', '1.1.0', '--separator', 'blank']), /--separator needs --commits/);
  assert.throws(() => parseArgs(['--from', '1.0.0', '--to', '1.1.0', '--patch-types', 'feat']), /cannot need both/);
  assert.throws(() => parseArgs(['--from']), /needs a value/);
  assert.throws(() => parseArgs(['--from', '1.0.0', '--to', '1.1.0', '--git']), /unknown argument --git/);
  assert.throws(() => parseArgs(['--from', '1.0.0', '--to', '1.1.0', '-']), /standard input/);
});

test('exit codes: 0 when the version matches, 1 on errors, 2 on usage or input errors', async () => {
  assert.equal(await main(minor, quiet), 0);
  assert.equal(await main(breaking, quiet), 1);
  assert.equal(await main(['--from', '1.4.2', '--to', '1.4.3'], quiet), 0);
  assert.equal(await main(['--from', '1.4.2', '--to', '01.4.3'], quiet), 1);
  assert.equal(await main(['--from', '1.4.2', '--to', '1.5.0', '--commits', at('examples/none.txt')], quiet), 2);
  assert.equal(await main(['--from', '1.4.2', '--package', at('examples/none.json')], quiet), 2);
  assert.equal(await main(['--from', '1.4.2', '--package', at('examples/commits-minor.txt')], quiet), 2);
  assert.equal(await main(['--from', '0.9.0', '--package', at('package-lock.json')], quiet), 0);
  assert.equal(await main(['--nope'], quiet), 2);
  assert.equal(await main(['--help'], quiet), 0);
  const v = await capture(['--version']);
  assert.equal(v.out.trim(), VERSION);
  const missing = await capture(['--from', '1.4.2', '--to', '1.5.0', '--commits', at('examples/none.txt')]);
  assert.match(missing.err, /none\.txt: no such file/);
  const usage = await capture(['--to', '1.5.0']);
  assert.ok(usage.err.includes(USAGE));
  const notJson = await capture(['--from', '1.4.2', '--package', at('examples/commits-minor.txt')]);
  assert.match(notJson.err, /not valid JSON/);
});

test('--fail-on warning fails on a skipped version; --strict fails on unparsed commits', async () => {
  const skipped = ['--from', '1.4.2', '--to', '1.6.0', '--commits', at('examples/commits-minor.txt')];
  assert.equal(await main(skipped, quiet), 0);
  assert.equal(await main([...skipped, '--fail-on', 'warning'], quiet), 1);
  const unparsed = ['--from', '1.4.2', '--to', '2.0.0', '--commits', at('examples/commits-breaking.txt')];
  assert.equal(await main(unparsed, quiet), 0);
  assert.equal(await main([...unparsed, '--strict'], quiet), 1);
});

test('the package.json version is read, and a package without one is refused', async () => {
  assert.equal(await readPackageVersion(at('examples/package.json')), '1.5.0');
  await assert.rejects(readPackageVersion(at('examples/commits-minor.txt')), /not valid JSON/);
  await assert.rejects(readPackageVersion(at('examples')), /not a file/);
  await assert.rejects(readPackageVersion(at('package.json'), { ...LIMITS, maxFileBytes: 10 }), /over the .* MB limit/);
  await assert.rejects(readPackageVersion(at('.github/dependabot.yml')), /not valid JSON/);
});

test('text output names the versions, the bump, each finding and each commit', async () => {
  const { out } = await capture(breaking);
  assert.ok(out.startsWith(`version-bump-check: 1.4.2 -> 1.5.0 (from ${at('examples/package.json')})\nbump: minor; the commits need: major; smallest correct version: 2.0.0\n6 commit(s): 2 breaking, 1 minor, 1 patch, 1 none, 1 not parsed\nfindings: 1 error, 0 warning, 1 info`));
  assert.match(out, /ERROR {5}bump-too-small {3}the commits need a major bump/);
  assert.match(out, / {2}major {5}refactor {4}api {11}yes {7}refactor\(api\)!: rename total to amount in the order response\n/);
  assert.match(out, / {2}unknown {3}- {11}- {23}Update README\n/);
  assert.match(out, /GATE: FAIL - 1 error\n$/);
  const ok = await capture(minor);
  assert.match(ok.out, /no findings: the version number matches the commits/);
  assert.match(ok.out, /GATE: PASS \(--fail-on error\)/);
});

test('commit bodies and footer text never appear in any format', async () => {
  const body = ['invoice service', 'Clients that read total', 'the order response field total is renamed', 'Accept header', 'BREAKING CHANGE', 'BREAKING-CHANGE'];
  for (const format of ['text', 'markdown', 'json', 'csv']) {
    const { out } = await capture([...breaking, '--format', format]);
    for (const b of body) assert.ok(!out.includes(b), `${format} shows "${b}"`);
    assert.ok(out.includes('rename total to amount in the order response'), format);
  }
  const minorOut = (await capture([...minor, '--format', 'json'])).out;
  assert.ok(!minorOut.includes('Totals in JPY'));
  assert.ok(!minorOut.includes('Refs: #41'));
});

test('JSON output holds the whole report', async () => {
  const { code, out } = await capture([...breaking, '--format', 'json']);
  assert.equal(code, 1);
  const r = JSON.parse(out);
  assert.deepEqual(r.counts, { error: 1, warning: 0, info: 1 });
  assert.deepEqual(r.bump, { actual: 'minor', required: 'major', smallest: '2.0.0' });
  assert.equal(r.gate.pass, false);
  assert.deepEqual(r.commits[2], { firstLine: 'refactor(api)!: rename total to amount in the order response', type: 'refactor', scope: 'api', breaking: true, effect: 'major' });
  assert.equal(toJson(r), `${JSON.stringify(r, null, 2)}\n`);
});

test('Markdown escapes pipes and line breaks so a commit line cannot break a table', () => {
  assert.equal(mdCell('a|b\nc\\d'), 'a\\|b c\\\\d');
  const md = toMarkdown(hostile());
  assert.match(md, /^## version-bump-check: 0 error, 0 warning, 1 info/);
  assert.match(md, /\| minor \| feat \| a\\\|b \| {2}\| feat\(a\\\|b\): =cmd\\\|x, "quoted" \|/);
  for (const line of md.split('\n').filter((l) => /^\| (minor|unknown) /.test(l))) {
    assert.equal(line.replace(/\\\|/g, '').split('|').length, 7, line);
  }
  assert.match(md, /\*\*Gate passed\*\* \(--fail-on error\)\./);
  assert.match(toMarkdown(checkRelease('1.0.0', '0.9.0', null)), /\*\*Gate failed:\*\* 1 error\./);
});

test('CSV follows RFC 4180 and defuses formulas', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=1+2'), "'=1+2");
  assert.equal(csvCell('-x'), "'-x");
  assert.equal(csvCell('+x'), "'+x");
  assert.equal(csvCell('@x'), "'@x");
  assert.equal(csvCell(null), '');
  const lines = toCsv(hostile()).split('\r\n');
  assert.equal(lines[0], 'kind,severity,id,effect,type,scope,breaking,text');
  assert.equal(lines[2], 'commit,,,minor,feat,a|b,no,"feat(a|b): =cmd|x, ""quoted"""');
  assert.equal(lines[3], "commit,,,unknown,,,no,'@sum(1)");
  assert.equal(lines[4], "commit,,,unknown,,,no,'-1 wip");
  assert.ok(toCsv(hostile()).endsWith('\r\n'));
});

test('the text format shows notes and stays on one line per item', () => {
  const r = checkRelease('1.4.2', '1.5.0', ['feat: a\u0085b\u2028c'], { notes: ['a note'] });
  const text = toText(r);
  assert.match(text, /\nnote: a note\n/);
  assert.ok(!/[\u0000-\u0008\u000b-\u001f\u0085\u2028]/.test(text));
  assert.match(toText(checkRelease('1.4.2', '1.4.3', null)), /no findings in the version numbers/);
});

test('a file without NUL characters is read as one message, with a note', async () => {
  const { out } = await capture(['--from', '1.4.2', '--to', '1.5.0', '--commits', at('LICENSE'), '--format', 'json']);
  const r = JSON.parse(out);
  assert.equal(r.commitCounts.total, 1);
  assert.ok(r.notes.some((n) => /no NUL character/.test(n)));
});
