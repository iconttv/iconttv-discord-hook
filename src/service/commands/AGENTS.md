# SERVICE COMMANDS KNOWLEDGE BASE

## OVERVIEW
`src/service/commands/` is a plugin-style command directory loaded dynamically at runtime for Discord slash commands.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Command loader contract | `src/service/commands/index.ts` | Discovers files, imports modules, caches handlers |
| Interaction dispatch | `src/controller/onCommandInteractionCreate.ts` | Resolves handler by `commandName` |
| Summary command flow | `src/service/commands/summarize.ts` | `deferReply` + summarize service + error reply mapping |
| Question command flow | `src/service/commands/question.ts` | permission gate + QA service |
| Command metadata examples | `src/service/commands/help.ts`, `src/service/commands/search.ts` | `SlashCommandBuilder` patterns |

## CONVENTIONS
- Every deployable command module must export both `data` (`SlashCommandBuilder`) and `execute` (`CommandInteraction` handler).
- Loader excludes `index.ts`, `index.js`, `.d.ts`, files starting with `_`, and non-TS/JS files.
- Keep command files side-effect-free at import time; dynamic importer executes module top-level code.
- Use early permission checks before expensive service calls.
- Use `interaction.deferReply()` for workflows that can exceed the 3-second interaction response window.
- Map provider errors to user-safe replies with `replyMessagePerError` where applicable.

## ANTI-PATTERNS
- Do not prefix deployable command files with `_`; they are intentionally skipped by loader filters.
- Do not export only `data` or only `execute`; loader will warn and command will not be usable.
- Do not rely on command file import order; file discovery order is runtime-dependent.

## NOTES
- `src/service/commands/_list.ts` is intentionally non-deployable because of `_` prefix.
