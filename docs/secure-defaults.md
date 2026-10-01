# Secure defaults

The default run is the safe run. Nothing below needs a flag, and none of it can be switched off.

## How the tool behaves by default

- **No network.** The tool reads the files it is given and sends nothing anywhere. It does not look up versions in a registry, does not fetch release notes, and does not check for updates. It can run in a locked-down build job with no outbound access at all.
- **No git, no commands.** The tool never runs git or any other program. It reads a file that a pipeline step wrote, so no tag name, range or path from the input is ever put on a command line, and no hook, filter or configuration in the repository runs because of the check.
- **No dependencies.** Node 22 or newer and nothing else, so there is no third-party code in the path of commit messages that may hold internal details.
- **Only the first line is shown.** The report lists each commit by its first line. The body and the footers are read to find a breaking change and then dropped: they never appear in any format. A ticket link, a customer name or a secret pasted into a message body stays out of the job summary.
- **Clean output.** Text from the input has control characters, line separators and direction controls removed and its length capped before it reaches a report, so a hostile message cannot rewrite the terminal or reorder what a reviewer reads. Markdown cells escape pipes, backslashes and line breaks. CSV cells are quoted as RFC 4180 says, and a cell that a spreadsheet would read as a formula gets a leading `'`.
- **Bounded input.** Files over 20 MB are refused before they are read. More than 50,000 commit messages stop the run. Lines over 16 KB are not read. Versions over 256 characters are invalid. The report says when a limit was reached, so a cut is never silent.
- **Strict versions.** A version is valid only when it is valid SemVer 2.0.0. A leading `v`, leading zeros, a missing number, an empty pre-release identifier and a stray `+` are all errors, never guessed at. A tool that guessed `v1.4` meant `1.4.0` would pass a release whose number other tools cannot read.
- **Full precedence.** Whether a version is higher is decided by SemVer item 11, with pre-releases and build metadata handled as the specification says, not by comparing text. `1.10.0` is higher than `1.9.0`, `1.0.0-rc.1` is lower than `1.0.0`, and `1.0.0+build.2` is the same as `1.0.0`.
- **Fails closed.** A missing option, a missing file, a file over the limit, too many messages, or a package.json without a version stops the run with exit code 2 and the reason, instead of a clean report about nothing.
- **The gate is on.** Without any option, an error makes the run exit with `1`: an invalid version, a version that does not go up, or a bump smaller than the commits need. A pipeline that adds the tool is protected from the first run; there is no report-only mode to forget to turn off.
- **Assumes the stricter case.** When it is unclear whether a commit is breaking, it is counted as breaking: a `BREAKING CHANGE:` line counts anywhere after the first line, not only in the footers. A lower-case `breaking change:` is not counted, as Conventional Commits says, but the report names the commit so a person can look.
- **Unknown commits are visible.** A message that is not in Conventional Commits form is never silently dropped: it is counted, listed by its first line, and reported as `unparsed-commit`. `--strict` turns that into an error.
- **Writes nothing to disk.** The report goes to the screen. Redirect it to a file, or to the job summary, only when you need to keep it.

## Running it in a pipeline safely

1. Write the commit messages with a fixed command in a step of its own: `git log --no-merges --format=%B%x00 "$last..HEAD" > commits.txt`. Quote the variables. Take the range from a tag on the protected branch, not from a value in the pull request.
2. Fetch the full history (`fetch-depth: 0` with `actions/checkout`). A shallow clone has no tags and too few commits, and the range is empty or wrong.
3. Run the check with read access to the repository and nothing else: no deploy keys, no registry tokens, no write permissions. It needs none.
4. Use the tool from a pinned commit. `npx --yes github:INNERLUXES/version-bump-check#<commit>` runs exactly the code that was reviewed, not whatever the default branch holds on the day.
5. Run the check in the release job, before the tag is pushed and before anything is published. A wrong version number that reaches a registry cannot be taken back: most registries refuse to publish the same version twice, so the only fix is another release.
6. Keep the default `--fail-on error`. Add `--fail-on warning` once the team agrees that skipped versions and larger bumps should stop a release too.
7. Write the Markdown report to the job summary, so the person who runs the release sees the commits and the findings in one place, and keep the exit code as the gate.
8. Do not add `--allow-larger` permanently. Pass it for the one release where a larger bump is on purpose, and say why in the release notes.
9. Run the check on pull requests too, with the version the pull request sets: authors then see the bump their commits need before the change is merged, not on release day.

## Writing commit messages the tool can check well

1. Use Conventional Commits for every message on the release branch, and check the form of each message (or of each pull request title, when pull requests are squashed) in the pull request itself.
2. Put `!` before the colon of every breaking change. A `!` is in the first line, where reviewers see it and where a squash merge keeps it; a footer can be lost.
3. When you squash, keep the `BREAKING CHANGE:` lines: set the repository to use the pull request description as the squash message, or copy them in by hand.
4. Write `BREAKING CHANGE:` in upper case, with a colon and a space, as the specification asks.
5. Use `feat` only for changes that users of the package or the API can see, and `fix` for corrections they can see. Use `refactor`, `test`, `docs`, `ci`, `build` or `chore` for the rest, so releases with only internal work stay patch releases.
6. Decide in the team which other types change the version (for example `deps` or `security` as patch), and pass them with `--patch-types` or `--minor-types` in the pipeline file, where the choice is reviewed.
7. Leave merge commits out with `--no-merges`, and write revert messages as `revert: <first line of the reverted commit>`.
8. Keep secrets, customer data and internal host names out of commit messages altogether. The tool does not show bodies, but the git history does, to everyone who can clone the repository.

## Releasing a version number safely

The tool tells you that a number is wrong; these are the usual ways to choose the right one and to release it without surprising the teams that depend on it.

1. **Let the commits decide.** Run the check before choosing the number, read the smallest correct version from the report, and use it. A larger number is a decision to document, not a default.
2. **Do not skip numbers.** Every released version should be the next one for its bump. When a release is withdrawn before anyone took it, reuse its number only if it was never published; once published, release the next number.
3. **Use pre-releases for trial versions.** Publish `2.0.0-rc.1` for teams that want to try a major release early. A pre-release comes before `2.0.0` and range rules such as `^1.4.0` do not pick it up, so nobody gets it by accident. Check the final release with `--from` set to the last normal release, so the whole cycle is checked.
4. **Leave 0.y.z on purpose.** Release 1.0.0 when the public API is stable and you are ready to follow SemVer strictly. Until then, the tool still asks for a minor bump for every breaking change, so teams that depend on a 0.y.z package can rely on patch releases.
5. **Write the release notes from the same commits.** The commit list in the report is the list of changes in the release. Group it by effect (breaking, features, fixes) and put the breaking changes first, with what users must change.
6. **Give notice of breaking changes.** Before a major release, mark what will change as deprecated in a minor release, so teams see the warning while they can still plan. Then remove it in the major release.
7. **Keep the version in one place.** Set the version in package.json (or the one file your build reads), check it with `--package`, and tag the release from that value, so the tag, the package and the release notes cannot disagree.

## Sharing a report safely

1. A report shows the first line of each commit message, its type and scope, and the two version numbers. For a public repository that is harmless. For an internal one it can show internal names in the first lines: share the report with the people who can see the repository.
2. The report never shows message bodies, footers, author names, email addresses, commit hashes or file paths from the repository. If a secret was pasted into a first line, it is shown, as it is in the git history; fix the history and rotate the secret.
3. Prefer the Markdown or text report over the raw commit file when you send the result to another team, so only the first lines leave the repository.
