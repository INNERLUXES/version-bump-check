# Threat model

## What the tool touches

- It reads the commit file and the package.json named on the command line, and only those. Nothing inside them is a path, an address or a command.
- It writes only to the screen (standard output and standard error).
- It opens no network connection, runs no git command and runs nothing from the files it reads.

## What the input may hold

Commit messages are written by everyone who can push to the repository, including people outside the team who send pull requests. In a pipeline that checks a pull request, the messages are written by the author of that pull request, so the tool treats them as possibly hostile. Message bodies can also hold things that should not be copied into a report shared with other teams: internal ticket links, customer names in a bug description, a stack trace with a host name, or a secret pasted by mistake. The tool shows only the first line of each message.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| The tool runs git with a range or a path from the input, and a crafted value runs another command or reads another repository | The tool never runs git. A pipeline step writes the messages to a file with a fixed command; the tool only reads that file |
| A message body or footer is copied into the report, where it leaks internal details or a pasted secret to everyone who reads the job summary | Only the first line of each message is kept; the body and the footers are read for a breaking change and dropped. Tests check, in all four formats, that no body or footer text appears |
| A message rewrites the terminal through escape sequences, or reorders text with direction characters | Control characters (C0 and C1), line and paragraph separators and Unicode direction controls are replaced by a space before any text reaches a report, and the length is capped |
| A message breaks the Markdown table in the job summary, or injects Markdown that hides a finding | Pipes, backslashes and line breaks are escaped in every table cell |
| A CSV report runs a formula when opened in a spreadsheet | Cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading `'`; every cell is quoted as RFC 4180 says |
| A huge file, a huge number of messages or a very long line exhausts memory or slows the run | Files over 20 MB are refused before they are read; more than 50,000 messages stop the run; lines over 16 KB are not read; versions over 256 characters are invalid |
| A pattern with nested repetition takes exponential time on a crafted line | The patterns for the first line and the footers have no nested repetition, and a line is at most 16 KB |
| A version string with huge numbers overflows and compares wrongly | Numbers are compared as text, by length and then digit by digit; the next version is computed with arbitrary precision |
| An author hides a breaking change to get a minor release past the gate | A `BREAKING CHANGE:` line counts anywhere after the first line, not only in the last paragraph. Hiding it entirely (writing `fix:` for a breaking change) is not something a message check can stop; review stops it, and docs/limits.md says so |
| A message in lower case (`breaking change:`) slips through as a non-breaking change | Conventional Commits requires upper case, so it is not counted, but the report adds a note that names the commit |
| A partial read gives a clean report for a release whose breaking change was in the part that was not read | Every limit stops the run or is reported: more than 50,000 messages is an error, long lines are counted in a note |
| A wrong file is given (a README instead of the commit file) and gives a clean report about nothing | A file with no NUL character in `nul` mode is reported in a note; a package.json without a version stops the run |
| A version is passed as a tag name (`v1.4.2`) and silently accepted with another meaning | A leading `v` is `version-invalid`, with the version without it in the message |

## Out of scope

Whether the messages are true, who may push commits, how the tag and the commit range were chosen, and the code itself. docs/limits.md lists what commit messages cannot show.
