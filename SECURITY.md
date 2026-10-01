# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "version-bump-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up commit file and the versions (example names, no real repositories, people, keys or tokens) that show the problem, what you expected and what happened.

## Scope

In scope:

- an input that makes the tool open a network connection, run git or any other program, or read a file it was not given
- a commit body or footer that appears in a report in any format
- an input that makes the tool hang, take very long or use unbounded memory
- text from a commit message that breaks a Markdown table, injects a formula into a CSV report, or rewrites the terminal through control or direction characters
- a version that is accepted although it is not valid SemVer 2.0.0, or refused although it is valid
- a precedence result that differs from SemVer item 11
- a breaking change that is not counted, or a bump that is reported as correct, when the rule for it in docs/method.md says otherwise

Out of scope: commit messages that do not say what the code does (docs/limits.md lists what messages cannot show), and how the commit range or the tag was chosen.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
