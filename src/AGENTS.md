# SRC KNOWLEDGE BASE

## OVERVIEW
`src/` contains all runtime entrypoints and module boundaries for bot events, archive ingestion, command execution, persistence, and AI workflows.

Detailed conventions: [index](../docs/coding-conventions/README.md), [core/runtime/adapters](../docs/coding-conventions/core-and-adapters.md), [Discord/commands](../docs/coding-conventions/discord-and-commands.md), [archive/persistence](../docs/coding-conventions/archive-and-persistence.md), [AI/prompts](../docs/coding-conventions/ai-and-prompts.md).

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
\- utils/                  # shared helpers + provider integration; prompts live in root static/
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Main startup | `src/index.ts` | Starts Mongo connection + event registration + bot login; connection helper currently returns no connect promise |
| Archive startup | `src/archive.ts` | Archive events + tracked-work drain + Discord/Mongo/Kafka teardown |
| CLI operations | `src/cli.ts` | `llm-question`, `embedding`, `backfill`; help imports initialize logger/SQLite |
| Slash command deploy | `src/deploy-commands.ts` | Purge and global register flow |
| Discord event routing | `src/controller/index.ts` | Message, command, modal listeners |
| Command execution contract | `src/controller/onCommandInteractionCreate.ts`, `src/service/commands/index.ts` | Dynamic handler lookup |
| Search/embedding path | `src/service/elasticService.ts`, `src/service/embedding/*` | Elastic queries + embedding pipelines; no in-repo index writer identified |
| Shared message/context utilities | `src/utils/message.ts`, `src/utils/discord/index.ts` | Channel links, `LogContext`, payload builders |
| Prompt sources/runtime fetch | `static/prompt-*.txt`, `src/utils/llm/openai.ts` | Sources are outside src; fetch from configured GitHub branch |
| Provider extensions | `src/repository/icons/`, `src/repository/search/IconSearchEngine.ts` | Reuse IconRepository/DTO/resolver and preserve provider order |

## CONVENTIONS
- Keep runtime entrypoints at `src/` root; each file maps to a distinct process mode.
- Controllers are thin routers; business logic belongs in `src/service/`.
- Import environment state through `src/config.ts`; avoid direct `process.env` reads in feature modules.
- Reuse `src/lib/logger.ts` and webhook reporting for operational error paths.
- Reuse existing context, identity, payload, model, logger, and OpenAI helpers before adding parallel abstractions.
- Preserve public contracts; unawaited work and incomplete lifecycle tracking are known risks, not conventions to copy.
- For convention changes, inspect current behavior, obtain a separate stateless black-box LLM implementation without source/internal conventions, then document actual mismatches. Generated code stays out of runtime files.

## ANTI-PATTERNS
- Do not add command handlers directly under `src/controller/`; command modules belong in `src/service/commands/`.
- Do not put long-running business logic into event listeners; delegate to service functions.
- Do not add new runtime commands only in shell scripts; wire canonical entrypoints in `package.json`.

## NOTES
- Local deep docs: `src/controller/AGENTS.md`, `src/service/AGENTS.md`, `src/service/archive/AGENTS.md`, `src/service/embedding/AGENTS.md`, `src/service/commands/AGENTS.md`, `src/repository/AGENTS.md`, `src/database/AGENTS.md`, `src/database/model/AGENTS.md`, `src/utils/AGENTS.md`, `src/utils/discord/AGENTS.md`, `src/utils/llm/AGENTS.md`.
