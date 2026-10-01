# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits, as the tool expects of yours: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, with `!` for a breaking change.

## Changing a rule

1. Describe the change in docs/method.md first: what the rule reports, and the SemVer or Conventional Commits item it follows. Where the tool goes beyond the specifications (the 0.y.z rule, `perf` as a patch, where a `BREAKING CHANGE:` line may stand), say so and say why.
2. Add a test with versions and commit messages written inline, where the result can be worked out by hand. For precedence, use the examples of SemVer item 11.
3. Text from the input goes through `safeText` before it reaches a finding or a commit row, and only the first line of a message is ever kept.
4. A finding id, once released, keeps its meaning: pipelines and other tools read it from the JSON and CSV reports.

## Rules for the code

- No runtime dependencies. Node 22 or newer and nothing else.
- The tool reads the files it is given and writes only to the screen. It opens no network connection and never runs git or any other program.
- Never commit real commit messages from another project, even as a fixture. Write made-up ones about made-up services.

## Before you open the pull request

```
npm test
npm run check
npm run example
```
