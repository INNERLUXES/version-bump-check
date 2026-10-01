# version-bump-check

Checks that a release's version number matches the changes in it, following [Semantic Versioning 2.0.0](https://semver.org/) and the commit messages since the last release, read as [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).

An enterprise web application is rarely used by one team. Other teams call its API, embed its front-end packages, or deploy it next to their own services, and they decide when to take a new release by its version number: patch and minor releases go in automatically, a major release waits for planned work. Release notes, update policies and dependency bots all trust that number. When a breaking change ships as 1.5.0, every team that auto-updates minor releases breaks on the same day; when a bug fix ships as 2.0.0, teams hold it back for weeks and miss the fix. This tool compares the version number with what the commits say they changed, before the release is tagged, and fails the release job when the number is wrong.

- Every finding has an id, a severity (error, warning, info) and a plain message that names the SemVer item it follows.
- Precedence is the full SemVer item 11 order, pre-releases included: `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0`.
- The report lists each commit's type, scope, whether it is breaking and the bump it needs, showing only the first line of each message, never the body.
- It never runs git. It reads a file of commit messages that a pipeline step wrote, and nothing else. It opens no network connection and runs nothing.
- Plain JavaScript, no dependencies; the same inputs always give the same report.

```
npm test
```

```
ℹ tests 38
ℹ pass 38
ℹ fail 0
```

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/version-bump-check.git
cd version-bump-check
node bin/version-bump-check.js --from 1.4.2 --package examples/package.json --commits examples/commits-breaking.txt
```

Or without a clone:

```
npx --yes github:INNERLUXES/version-bump-check --from 1.4.2 --to 1.5.0 --commits commits.txt
```

`examples/package.json` is a made-up orders service at version 1.5.0. `examples/commits-breaking.txt` holds its commit messages since 1.4.2, the way `git log --format=%B%x00` writes them: a feature, a fix, a refactor with `!` that renames a response field, a feature with a `BREAKING-CHANGE:` footer, a test, and one message that is not in Conventional Commits form:

```
version-bump-check: 1.4.2 -> 1.5.0 (from examples/package.json)
bump: minor; the commits need: major; smallest correct version: 2.0.0
6 commit(s): 2 breaking, 1 minor, 1 patch, 1 none, 1 not parsed
findings: 1 error, 0 warning, 1 info

ERROR     bump-too-small   the commits need a major bump (2 breaking changes: "refactor(api)!: rename total to amount in the order response", "feat(receipts): send receipts as PDF"), but 1.4.2 -> 1.5.0 is a minor bump; the smallest correct version is 2.0.0

INFO      unparsed-commit  1 commit message not in Conventional Commits form, so its effect is unknown and not counted: "Update README"

commits (first line only):
  EFFECT    TYPE        SCOPE         BREAKING  FIRST LINE
  minor     feat        orders                  feat(orders): filter the order list by status
  patch     fix         orders                  fix(orders): round order totals to the currency minor unit
  major     refactor    api           yes       refactor(api)!: rename total to amount in the order response
  major     feat        receipts      yes       feat(receipts): send receipts as PDF
  unknown   -           -                       Update README
  none      test        -                       test: cover the status filter

GATE: FAIL - 1 error
```

The exit code is `1`. With `examples/commits-minor.txt` (features, fixes and docs, nothing breaking) the same version passes with exit code `0`.

## Usage

```
version-bump-check --from <version> (--to <version> | --package <file>) [--commits <file>] [options]
```

```
--from <version>        the previous release, such as 1.4.2
--to <version>          the new version, such as 1.5.0
--package <file>        read the new version from the "version" field of this package.json
--commits <file>        the commit messages since the previous release
--separator <name>      nul (messages separated by NUL) or blank (one message per block of
                        lines, blocks separated by blank lines) (default: nul)
--format <name>         text, markdown, json or csv (default: text)
--fail-on <level>       exit with 1 when a finding is at this level or above: error or warning
                        (default: error)
--strict                commit messages not in Conventional Commits form are errors
--allow-larger          a bump larger than the commits need is info, not a warning
--zero-major-strict     in 0.y.z, a breaking change needs 1.0.0 (default: at least a minor bump)
--minor-types <types>   more commit types that need a minor bump, separated by commas
--patch-types <types>   more commit types that need a patch bump, separated by commas
--help                  show the usage
--version               show the version
```

Versions are given without a leading `v`: `v1.4.2` is a tag name, not a version number, and is reported as `version-invalid`. Without `--commits`, only the two version numbers are checked.

## How commits count

| Commit | Bump it needs |
| --- | --- |
| `!` before the colon (`feat!:`, `refactor(api)!:`), or a `BREAKING CHANGE:` or `BREAKING-CHANGE:` line after the first line | major |
| `feat` | minor |
| `fix`, `perf` | patch |
| `docs`, `chore`, `test`, `ci`, `build`, `refactor`, `style` and any other type | none |
| not in Conventional Commits form | unknown: not counted, reported as `unparsed-commit` |

The release needs the largest bump of its commits. `--minor-types` and `--patch-types` add types of your own, such as `--patch-types deps,security`.

**0.y.z.** SemVer item 4 says anything may change in 0.y.z. This tool applies a rule there that most teams use: in 0.y.z a breaking change needs **at least a minor bump** (0.9.1 to 0.10.0), a feature a minor bump and a fix a patch bump. `--zero-major-strict` asks for 1.0.0 for a breaking change instead. Moving from 0.y.z to 1.0.0 is never reported as too large.

## Findings

| Id | Severity | What it reports |
| --- | --- | --- |
| `version-invalid` | error | A version is not valid SemVer 2.0.0: leading zeros, a missing part, a leading `v`, an empty or badly formed pre-release or build identifier |
| `not-increasing` | error | The new version is not higher than the previous one by SemVer precedence, including pre-release order; build metadata does not count |
| `bump-too-small` | error | The commits need a larger bump, such as a breaking change in a minor release; the smallest correct version is named |
| `bump-too-large` | warning / info | The bump is larger than the commits need, such as only fixes in a major release; info with `--allow-larger` |
| `skipped-version` | warning | The new version is not the next one for its bump, such as 1.4.2 to 1.6.0 or 1.4.2 to 1.4.4 |
| `unparsed-commit` | info / error | Commit messages not in Conventional Commits form, counted and listed by first line; an error with `--strict` |
| `pre-release` | info | A version is a pre-release, and how that changes the check |

[docs/method.md](docs/method.md) gives each rule with the SemVer and Conventional Commits item it follows.

## Formats

- `text`: for a terminal, errors first, then each commit.
- `markdown`: a table of findings and a table of commits, for a pull request comment or the job summary. Pipes and line breaks in commit lines are escaped, so a message cannot break the table.
- `json`: the whole report, for other tools.
- `csv`: one row per finding, then one row per commit, quoted as RFC 4180 says. A cell that starts with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet does not run it as a formula.

## Exit codes

`0` no finding at the `--fail-on` level, `1` at least one such finding (by default: an error), `2` a usage or input error (a missing option, a missing file, a file over 20 MB, more than 50,000 commit messages, a package.json without a `version`).

## In a pipeline

Write the commit messages since the last release tag to a file, then check the version in `package.json` against them. The release job fails when the number is wrong:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  with:
    fetch-depth: 0
- name: Commit messages since the last release
  run: |
    last=$(git describe --tags --abbrev=0 --match 'v*')
    echo "LAST=${last#v}" >> "$GITHUB_ENV"
    git log --no-merges --format=%B%x00 "$last..HEAD" > commits.txt
- name: Check the version bump
  run: |
    npx --yes github:INNERLUXES/version-bump-check --from "$LAST" --package package.json --commits commits.txt --format markdown >> "$GITHUB_STEP_SUMMARY"
```

The step summary shows the tables; the exit code fails the job. `--no-merges` leaves out merge commits, whose messages are not in Conventional Commits form. Add `--fail-on warning` to stop on skipped versions and larger bumps too, and `--strict` once every message follows Conventional Commits.

## Limits

The tool reads commit messages, not code. A message that does not say a change breaks something, a squash merge that keeps only one line, and a change made without a commit message that describes it are not visible to it. For an HTTP API, pair it with a check of the API itself, such as [api-break-check](https://github.com/INNERLUXES/api-break-check). [docs/limits.md](docs/limits.md) lists these, with the size limits.

## Background

- How release numbers, update policies and shared APIs are run for applications that many teams depend on: [enterprise web development](https://innerluxes.dev/web-development/enterprise).

## License

MIT
