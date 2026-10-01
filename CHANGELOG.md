# Changes

## 1.0.0

First release.

- Checks that a release's version number matches the changes in it, following Semantic Versioning 2.0.0, with the commit messages since the last release read as Conventional Commits 1.0.0.
- Versions read exactly as SemVer 2.0.0 defines them, and compared with the full precedence of SemVer item 11, pre-releases included; build metadata ignored.
- Commit messages read from a file, separated by NUL as `git log --format=%B%x00` writes them, or by blank lines; the tool never runs git.
- Breaking changes found from `!` in the first line and from `BREAKING CHANGE:` and `BREAKING-CHANGE:` lines; `feat` needs a minor bump, `fix` and `perf` a patch bump, more types with `--minor-types` and `--patch-types`.
- Seven findings: `version-invalid`, `not-increasing`, `bump-too-small`, `bump-too-large`, `skipped-version`, `unparsed-commit` and `pre-release`; `--strict`, `--allow-larger` and `--zero-major-strict` change how strict they are.
- In 0.y.z, a breaking change needs at least a minor bump, or 1.0.0 with `--zero-major-strict`.
- Reports as text, Markdown, JSON and CSV, with only the first line of each commit message; `--fail-on` for a pipeline gate.
- Bounded input: files over 20 MB refused, at most 50,000 commit messages, lines over 16 KB not read, versions over 256 characters invalid.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation.
