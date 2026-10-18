# SERVICE KNOWLEDGE BASE

## OVERVIEW
`src/service/` is the workflow layer: command execution, archive ingestion, embedding/search, and feature-specific orchestration.

Detailed conventions: [Discord/commands](../../docs/coding-conventions/discord-and-commands.md), [archive/persistence](../../docs/coding-conventions/archive-and-persistence.md), [AI/prompts](../../docs/coding-conventions/ai-and-prompts.md), [core/runtime](../../docs/coding-conventions/core-and-adapters.md).

## STRUCTURE
```text
src/service/
|- commands/               # slash command modules + dynamic loader
|- archive/                # archive-only message ingest workflow
|- embedding/              # OCR/summarization/embedding pipeline
|- messageService.ts       # summarize/question over recent messages
|- elasticService.ts       # Elastic keyword/vector queries + activity statistics
|- iconService.ts          # icon replacement flow
|- imageToEmbedService.ts  # image-to-embed conversion flow
|- imageService.ts         # image-generation facade
|- kafkaService.ts         # optional Kafka producer and publish
|- settingService.ts       # guild setting fetch
\- common.ts               # shared AI request persistence helper
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Slash command implementation | `src/service/commands/*.ts` | One file per command contract |
| Dynamic command loading | `src/service/commands/index.ts` | Caches command metadata + handlers |
| Archive message ingest | `src/service/archive/message.ts` | Persist + embed + Kafka path |
| LLM summarize/question | `src/service/messageService.ts` | Cached summaries + QA execution |
| Embedding generation | `src/service/embedding/discord_processor.ts`, `src/service/embedding/client.ts` | Text extraction + model calls |
| Search APIs | `src/service/elasticService.ts` | Keyword + vector queries and voice/message statistics |
| Optional fan-out | `src/service/kafkaService.ts` | Guarded by `KAFKA_ENABLE` and REST proxy |

## CONVENTIONS
- Keep interaction reply/defer/edit lifecycle in command handlers. Services orchestrate feature behavior; message replacement services intentionally send/delete Discord messages, so services are not universally side-effect free.
- Pass explicit guild/channel/sender context into service calls instead of relying on global state.
- Use `saveAiRequestBuilder` (`src/service/common.ts`) when issuing LLM summarize/question requests.
- Preserve integration-specific activation: Kafka uses truthy `KAFKA_ENABLE` plus `KAFKA_REST_PROXY`; Elastic validates host/API when queried; some AI clients initialize on import. Do not assume a single feature-flag convention.
- Reuse message identity and LogContext helpers; preserve TEXT_/EMBEDDING_ field names and Icon DTO shapes.
- Treat live ingestion, backfill, message update, and CLI re-embedding as separate paths; they do not currently have identical side effects.

## ANTI-PATTERNS
- Do not register Discord event listeners in service files; routing belongs in `src/controller/`.
- Do not add deployable slash commands outside `src/service/commands/`.
- Use existing user-facing error mapping where appropriate. Unknown errors can currently include raw error text; do not claim all provider errors are sanitized or expose additional secrets.

## NOTES
- Child module docs exist for command/archive/embedding conventions: `src/service/commands/AGENTS.md`, `src/service/archive/AGENTS.md`, `src/service/embedding/AGENTS.md`.
