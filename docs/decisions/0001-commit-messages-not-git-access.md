# 1. Read a file of commit messages, not the git repository

## Context

The tool needs the commit messages since the last release. The easy way is to run git itself: find the last tag, run `git log` for the range, and read the output. That makes the tool depend on a git binary being installed and on the shape of the repository (a shallow clone in a pipeline has no tags and no history, and fails in ways that are hard to read). It also means the tool builds a command line from its input: a tag name, a range, a path. Running git on a repository also runs whatever the repository configures: hooks for some commands, filters, `core.fsmonitor`, and options read from a `.git/config` that the checked-out code can influence. A check that runs on pull requests from outside the team should not run anything those authors control.

## Decision

The tool never runs git and never reads the repository. A pipeline step writes the messages to a file with a fixed command (`git log --no-merges --format=%B%x00 <tag>..HEAD > commits.txt`), and the tool reads only that file and, with `--package`, one package.json.

## Consequences

The tool runs anywhere Node runs, with no git binary, and on any history source: a git log, a list exported from a code review system, or a hand-written list for a test. The same file always gives the same report. It runs no command and builds no command line, so no input can make it run anything. The pipeline must fetch enough history for the range (`fetch-depth: 0`) and choose the range, which keeps that choice visible in the pipeline file where it can be reviewed. The cost is one extra line in the pipeline, and the README shows it.
