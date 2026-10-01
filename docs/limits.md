# Limits

## What commit messages cannot show

- **Messages can be wrong.** The tool believes the messages. A breaking change committed as `fix: tidy the order response` is counted as a fix, and the release passes as a patch release. A `feat!:` on a change that breaks nothing asks for a major release that is not needed. The check is only as good as the discipline of the people who write the messages; review the message as part of the pull request.
- **Messages can be missing.** A message that is not in Conventional Commits form is not counted at all, and reported as `unparsed-commit`. Its change may be breaking. Use `--strict` to make such messages fail the run once the team writes every message in the form.
- **Squash merges.** When a pull request is squashed into one commit, the message is usually the pull request title, and the `BREAKING CHANGE:` lines of the commits inside it are lost unless someone copies them into the squashed message. Set the repository to use the pull request title and description as the squash message, and check the title against Conventional Commits in the pull request.
- **Rebase and history rewrites.** The tool reads the messages it is given. If the history between the tag and `HEAD` was rewritten, or the tag points to a commit that is not an ancestor of `HEAD`, `git log tag..HEAD` lists other commits than the ones released. The tool cannot see that.
- **Merge commits.** A merge commit message (`Merge branch 'main' into release`) is not in Conventional Commits form. Leave merge commits out with `git log --no-merges`, or they are counted as unparsed.
- **Reverts.** Conventional Commits leaves reverts to the tooling. A `revert:` commit is a type with no effect, and a `Revert "feat: x"` message is not parsed. A feature that was added and reverted in the same release still counts as a feature, so the release may be reported as needing a minor bump it no longer needs; pass `--allow-larger` or check by hand in that case.
- **The code itself.** The tool cannot see the code. A change that breaks a public API but is described as anything else is invisible to it. For an HTTP API, pair this check with a comparison of the API description itself, such as [api-break-check](https://github.com/INNERLUXES/api-break-check), which compares two OpenAPI descriptions and lists the changes that break existing clients. For a library, pair it with a check of its exported types or symbols.
- **What "breaking" means for your users.** A change that one team calls breaking (a new required configuration value, a dropped runtime version, a changed default) may be a feature to another. The tool follows what the message says; agree in the team what needs a `!`.
- **Several packages in one repository.** The tool checks one version against one list of messages. For a repository with several packages, give each package its own list (for example with `git log -- packages/orders`) and run the check once per package.

## What is read

- **Versions** exactly as SemVer 2.0.0 defines them; anything else is `version-invalid`, including a leading `v`.
- **package.json** with `--package`: the file is read as JSON and only its `version` field is used. A file that is not JSON, holds no object, or has no text `version` stops the run with exit code 2.
- **Commit messages** from one file. With `--separator nul` (the default), messages are separated by a NUL character, as `git log --format=%B%x00` writes them; this keeps multi-line bodies and footers together. With `--separator blank`, each block of lines separated by blank lines is one message; use it for a list written by hand, where a message has no blank line inside it. A file in `nul` mode with no NUL character at all is read as one message, and the report says so.
- Windows line ends and a leading byte order mark are accepted.

## Size

- A commit file or package.json over 20 MB is refused before it is read.
- At most 50,000 commit messages are read. A file with more stops the run with exit code 2, rather than checking only part of a release: a breaking change in the part that was left out would be missed. Check a shorter range of commits.
- A line over 16 KB is not read. It is replaced by a marker, the report counts such lines in a note, and a message whose first line was too long is reported as not parsed.
- A version longer than 256 characters is invalid.
- Text shown in a report is cut to a fixed length: 200 characters for a commit's first line, less for a type or a scope.

Every limit is reported, as an error, a finding or a note, so a cut is never silent.
