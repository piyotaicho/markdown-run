# AGENTS.md

## Scope
This repository contains a VS Code extension that runs SQL and R fenced code blocks from Markdown.

## Working Agreement
- Keep behavior consistent with README and copilot instructions.
- Prefer small, reversible edits.
- Always compile after code changes.

## Implementation Map
- Main entry: src/extension.ts
- SQL flow:
  - runCurrentCodeBlock -> runSqlBlock
  - mysql.* command plan is deprecated/discarded
  - do not add new mysql.*-based execution paths
- R flow:
  - runCurrentCodeBlock -> runRBlock
  - runRBlock -> getExistingRTerminal

## Decision Log
1. Code block detection
- Detect fenced block around cursor or CodeLens-supplied line.
- Support SQL/R labels explicitly.

2. SQL execution strategy
- The mysql.* command strategy has been discarded by requirement change.
- Treat any remaining mysql.* behavior as legacy and scheduled for replacement.
- New SQL execution proposals must avoid mysql.* dependency.
- Current transitional operation may delegate execution to another extension by materializing SQL code blocks as SQL-format document/file context.

3. R execution strategy
- Do not auto-create R terminal.
- Require an existing R terminal and show guidance if missing.

## Change Checklist
1. Read src/extension.ts and README.md before editing.
2. Confirm requirement delta in one sentence.
3. Implement with minimal scope.
4. Run npm run compile.
5. Update README when behavior changed.
6. Report what changed and why.

## Validation Checklist
- Command registration still works: markdownRunner.runCodeBlock
- CodeLens still appears on SQL/R fenced blocks
- SQL path:
  - no reintroduction of discarded mysql.* execution strategy
- R path:
  - executes on existing terminal
  - warning shown when terminal not found

## Notes for Future Agents
- User expects practical implementation first, not only design discussion.
- If behavior is ambiguous, prioritize current README + latest user instruction.
- Do not reintroduce removed behavior without explicit request.
- mysql.* based SQL execution plan is explicitly abandoned; do not propose it as an option.
