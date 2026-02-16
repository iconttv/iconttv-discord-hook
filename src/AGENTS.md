# SRC KNOWLEDGE BASE

## OVERVIEW
`src/` contains all runtime entrypoints and module boundaries for bot events, archive ingestion, command execution, persistence, and AI workflows.

## STRUCTURE
```text
src/
|- index.ts                # main bot runtime
|- archive.ts              # archive runtime
|- cli.ts                  # ops CLI runtime
|- deploy-commands.ts      # slash command registration runtime
|- config.ts               # environment and feature flags
|- controller/             # event wiring and interaction routing
|- service/                # app workflows (commands/archive/embedding/search)
|- repository/             # icon/search adapter layer
|- database/               # Mongo connection + schemas
|- lib/                    # singleton clients (discord, logger)
|- models/                 # shared TypeScript interfaces
|- type/                   # discord command type aliases
\- utils/                  # cross-cutting helpers + prompt assets
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Main startup | `src/index.ts` | Mongo + event registration + bot login |
| Archive startup | `src/archive.ts` | Archive event registration + Kafka producer teardown |
| CLI operations | `src/cli.ts` | `llm-question`, `embedding` subcommands |
| Slash command deploy | `src/deploy-commands.ts` | Purge and global register flow |
| Discord event routing | `src/controller/index.ts` | Message, command, modal listeners |
| Command execution contract | `src/controller/onCommandInteractionCreate.ts`, `src/service/commands/index.ts` | Dynamic handler lookup |
| Search/embedding path | `src/service/searchService.ts`, `src/service/embedding/*` | Elastic + embedding pipelines |
| Shared message/context utilities | `src/utils/message.ts`, `src/utils/discord/index.ts` | Channel links, `LogContext`, payload builders |

## CONVENTIONS
- Keep runtime entrypoints at `src/` root; each file maps to a distinct process mode.
- Controllers are thin routers; business logic belongs in `src/service/`.
- Import environment state through `src/config.ts`; avoid direct `process.env` reads in feature modules.
- Reuse `src/lib/logger.ts` and webhook reporting for operational error paths.

## ANTI-PATTERNS
- Do not add command handlers directly under `src/controller/`; command modules belong in `src/service/commands/`.
- Do not put long-running business logic into event listeners; delegate to service functions.
- Do not add new runtime commands only in shell scripts; wire canonical entrypoints in `package.json`.

## NOTES
- Local deep docs: `src/service/AGENTS.md`, `src/service/commands/AGENTS.md`, `src/utils/AGENTS.md`, `src/utils/discord/AGENTS.md`.
