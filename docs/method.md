# Method

The tool answers one question: does the new version number say what the commits since the last release changed? It reads the previous and the new version, reads the commit messages, works out the bump the commits need, and compares it with the bump the version number makes. The version rules follow [Semantic Versioning 2.0.0](https://semver.org/) (SemVer), and the commit rules follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). "SemVer item N" and "Conventional Commits item N" below are the numbered items of those two specifications.

## Who reads the version number

Teams that depend on an enterprise web application read its version number before they read anything else. A dependency bot opens a pull request for a minor release and merges it when the tests pass. An update policy says that patch releases are taken at once, minor releases within the sprint, and major releases only with planned work. A platform team that hosts many services pins a range such as `^1.4.0` and takes whatever matches. Each of these trusts the number:

- A breaking change in a minor or a patch release breaks every team that takes those releases automatically, on the same day, and the release notes give them no warning.
- A fix released as a major version is held back by every team that waits for major releases, so they keep the bug.
- A skipped number (1.4.2 to 1.6.0) makes people look for the release that is missing, and makes tools that compute ranges or changelogs from the numbers give odd results.

A finding is an **error** when the number is wrong in a way that misleads the teams that depend on it. It is a **warning** when the number is unusual and should be confirmed. It is **info** when nothing is wrong but the report has something worth knowing.

## Reading a version

A version is read as SemVer item 2, 9 and 10 define it, with no tolerance:

1. **Version core.** Three non-negative numbers, `MAJOR.MINOR.PATCH`, separated by dots, with no leading zeros (SemVer item 2). `1.4`, `1.4.2.0`, `01.4.2` and `1.04.2` are not versions.
2. **Pre-release.** A `-` after the core, then dot-separated identifiers of ASCII letters, digits and hyphens. No identifier may be empty, and a numeric identifier has no leading zeros (SemVer item 9). `1.0.0-rc.1` is valid; `1.0.0-`, `1.0.0-rc..1` and `1.0.0-01` are not.
3. **Build metadata.** A `+` after the core or the pre-release, then dot-separated identifiers of ASCII letters, digits and hyphens, none empty. Leading zeros are allowed here (SemVer item 10). `1.0.0+001` is valid; `1.0.0+` and `1.0.0+a+b` are not.
4. **No prefix.** `v1.4.2` is a common tag name, but it is not a version number. It is reported as invalid with the version without the `v`, so a pipeline that passes the tag name by mistake is told how to fix it.
5. **Large numbers.** Numbers are compared as text (the longer number is larger, then digit by digit), so a version with numbers too large for a JavaScript number is still read and compared exactly.
6. **Bounded.** A version longer than 256 characters is invalid.

## Precedence

Precedence decides whether the new version is higher than the old one. It follows SemVer item 11 exactly:

1. The version cores are compared number by number, major, then minor, then patch: `1.0.0 < 2.0.0 < 2.1.0 < 2.1.1` (item 11.2).
2. With equal cores, a pre-release comes before the normal version: `1.0.0-alpha < 1.0.0` (item 11.3).
3. Two pre-releases with the same core are compared identifier by identifier from left to right (item 11.4): numeric identifiers numerically (11.4.1), others in ASCII order (11.4.2), a numeric identifier before an alphanumeric one (11.4.3), and when all shared identifiers are equal the longer list comes later (11.4.4). The example of item 11 holds: `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0`.
4. Build metadata is ignored (item 10): `1.0.0+a` and `1.0.0+b` have the same precedence.

## Reading a commit message

Each message is read as Conventional Commits defines it:

1. **First line.** `type(scope)!: description`. The type is a word of letters, digits and hyphens (item 1); the scope is optional and stands in parentheses (item 4); `!` is optional (item 13); then a colon, one space, and a description that is not empty (items 1 and 5). Anything else, such as `Update README`, `feat:missing space`, `fixup! feat: x` or a merge commit message, is not in Conventional Commits form.
2. **Types are not case sensitive** (item 15): `FIX:` is read as `fix`.
3. **Body and footers.** The body starts after the first line (item 6). Footers are in the last paragraph: a token of letters, digits and hyphens, or `BREAKING CHANGE`, then `: ` or ` #` (items 8 to 10). A footer value can run over several lines.
4. **Breaking change.** A commit is breaking when its first line has `!` before the colon (item 13), or when a line after the first one starts with `BREAKING CHANGE:` (items 11 and 12) or its synonym `BREAKING-CHANGE:` (item 16). The token must be in upper case (item 15): `breaking change:` does not count, and the report adds a note that names the commit so it can be checked.
5. **Where the breaking line stands.** Conventional Commits puts `BREAKING CHANGE:` in the footers. The tool counts such a line anywhere after the first line, also in the middle of the body, and also in a message written in `--separator blank` form, where there is no blank line before it. An author who wrote it meant that the change breaks something; reading it as a breaking change is the stricter choice. A `BREAKING CHANGE:` in the first line is only part of the description.

Only the first line of each message is kept for the report. The body and the footers are read to find a breaking change and then dropped; they are never shown.

## The bump each commit needs

| Commit | Bump | Rule |
| --- | --- | --- |
| Breaking (`!` or a `BREAKING CHANGE:` line), of any type | major | Conventional Commits items 11 to 13 and 16; SemVer item 8: incompatible API changes increment MAJOR |
| `feat` | minor | Conventional Commits item 2 and the summary: feat correlates with MINOR; SemVer item 7: new backward compatible functionality increments MINOR |
| `fix` | patch | Conventional Commits item 3: fix correlates with PATCH; SemVer item 6: backward compatible bug fixes increment PATCH |
| `perf` | patch | A performance improvement changes behaviour without new functionality; it is released like a fix |
| `docs`, `chore`, `test`, `ci`, `build`, `refactor`, `style` and any other type | none | Conventional Commits item 14 and its summary: types other than feat and fix have no implicit effect in SemVer, unless they include a breaking change |
| Not in Conventional Commits form | unknown | Not counted: the tool cannot tell what it changed. Reported as `unparsed-commit` |

`--minor-types` and `--patch-types` add types of your own. A type cannot need both a minor and a patch bump; giving one in both, or `feat` as a patch type, is a usage error.

The release needs the largest bump among its commits: one breaking commit makes the whole release a major release.

## The 0.y.z rule

SemVer item 4 says that major version zero is for initial development: anything may change at any time, and the public API should not be considered stable. Read literally, no bump in 0.y.z is ever wrong. In practice, teams that depend on a 0.y.z package still read the number, and most package managers treat a minor bump in 0.y.z the way they treat a major bump after 1.0.0 (`^0.9.1` does not accept `0.10.0`).

So the tool applies this rule when the previous version is 0.y.z:

- A breaking change needs **at least a minor bump**: 0.9.1 to 0.10.0, not 0.9.2. This is the default, and the report adds a note saying so whenever it applies.
- With `--zero-major-strict`, a breaking change needs **1.0.0**, for teams that treat every breaking change as a reason to declare the API stable.
- A feature needs a minor bump and a fix a patch bump, as after 1.0.0.
- Moving from 0.y.z to 1.0.0 is never reported as too large: 1.0.0 defines the public API (SemVer item 5) and is a decision, not a result of the commits. The report notes it.

## The findings

| Id | Severity | Rule |
| --- | --- | --- |
| `version-invalid` | error | The previous or the new version breaks SemVer items 2, 9 or 10, or has a `v` in front. The message gives the reason and the item. With an invalid version, the bump is not measured |
| `not-increasing` | error | The new version is not higher than the previous one by SemVer item 11: lower, the same, or the same except for build metadata (item 10). A pre-release of the same version (1.5.0 to 1.5.0-rc.1) is lower, since it comes before the normal version (item 11.3) |
| `bump-too-small` | error | The bump the version number makes (the first core number that changed) is smaller than the bump the commits need. The message counts the commits that need it, names up to three by their first line, and gives the smallest correct version |
| `bump-too-large` | warning / info | The bump is larger than the commits need. A release always needs at least a patch bump, so a patch release is never too large, even with only docs and chores. A larger bump is often on purpose (a marketing release, a rewrite announced as a major version), so it is a warning, and info with `--allow-larger` |
| `skipped-version` | warning | The new version is not the next one for the bump it makes: the next patch version is `MAJOR.MINOR.(PATCH+1)`, the next minor version `MAJOR.(MINOR+1).0` and the next major version `(MAJOR+1).0.0` (SemVer items 6, 7 and 8, which reset the lower numbers to zero). 1.4.2 to 1.6.0 skips 1.5.0; 1.4.2 to 1.5.1 skips 1.5.0; 1.4.2 to 1.4.4 skips 1.4.3 |
| `unparsed-commit` | info / error | Commit messages that are not in Conventional Commits form, counted, with up to five first lines in the message and every one in the commit list. Their effect is unknown and they do not count toward the required bump, which is why `--strict` makes this an error |
| `pre-release` | info | The new version is a pre-release: it comes before the normal version (item 11.3) and may not be stable (item 9), and the bump is checked on its version core. Or the previous version is a pre-release: the bump is measured from its version core, and skipped versions are not checked, since that core was never released. When both have the same core (2.0.0-rc.1 to 2.0.0), the bump cannot be measured at all, and the note says to pass the last normal release as `--from` |

## Severity and the gate

`--fail-on error`, the default, makes the run exit with `1` when any error is found. `--fail-on warning` also fails on warnings. Info never fails a run.

The method has no randomness and no network access: the same versions and the same file of messages always give the same report, and any change in the report comes from a change in the input.
