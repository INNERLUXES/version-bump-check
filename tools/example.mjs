// Runs the README examples and checks that they report what the README shows.

import { main } from '../src/index.js';

async function run(argv) {
  let out = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => process.stderr.write(t) });
  process.stdout.write(out);
  return { code, out };
}

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})`);
  }
}

// The commit bodies and footers of both examples: they must never be shown.
const bodies = ['Without it the list is', 'Totals in JPY', 'Refs: #41', 'invoice service', 'BREAKING CHANGE', 'BREAKING-CHANGE', 'Accept header'];

const minor = await run(['--from', '1.4.2', '--package', 'examples/package.json', '--commits', 'examples/commits-minor.txt']);
expect('commits-minor', minor, 0, [
  'version-bump-check: 1.4.2 -> 1.5.0 (from examples/package.json)',
  'bump: minor; the commits need: minor; smallest correct version: 1.5.0',
  '5 commit(s): 0 breaking, 1 minor, 2 patch, 2 none, 0 not parsed',
  'no findings: the version number matches the commits',
  'GATE: PASS (--fail-on error)'
], ['bump-too-small', 'bump-too-large', 'skipped-version', ...bodies]);

process.stdout.write('\n');
const breaking = await run(['--from', '1.4.2', '--package', 'examples/package.json', '--commits', 'examples/commits-breaking.txt']);
expect('commits-breaking', breaking, 1, [
  'bump: minor; the commits need: major; smallest correct version: 2.0.0',
  '6 commit(s): 2 breaking, 1 minor, 1 patch, 1 none, 1 not parsed',
  'findings: 1 error, 0 warning, 1 info',
  'ERROR     bump-too-small   the commits need a major bump (2 breaking changes',
  'the smallest correct version is 2.0.0',
  'INFO      unparsed-commit  1 commit message not in Conventional Commits form',
  '"Update README"',
  'major     refactor    api           yes       refactor(api)!: rename total to amount in the order response',
  'major     feat        receipts      yes       feat(receipts): send receipts as PDF',
  'GATE: FAIL - 1 error'
], ['skipped-version', 'bump-too-large', ...bodies]);

if (problems.length) {
  for (const p of problems) console.error(`example: ${p}`);
  process.exit(1);
}
