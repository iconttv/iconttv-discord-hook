# SERVICE KNOWLEDGE BASE

## OVERVIEW
`src/service/` is the workflow layer: command execution, archive ingestion, embedding/search, and feature-specific orchestration.

## STRUCTURE
```text
src/service/
|- commands/               # slash command modules + dynamic loader
|- archive/                # archive-only message ingest workflow
|- embedding/              # OCR/summarization/embedding pipeline
|- messageService.ts       # summarize/question over recent messages
|- searchService.ts        # Elastic keyword + vector search
|- iconService.ts          # icon replacement flow
|- imageToEmbedService.ts  # image-to-embed conversion flow
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
| Search APIs | `src/service/searchService.ts` | Keyword + vector scoring |
| Optional fan-out | `src/service/kafkaService.ts` | Guarded by `KAFKA_ENABLE` and REST proxy |

## CONVENTIONS
- Keep Discord interaction I/O in command handlers; service functions should return data/results.
- Pass explicit guild/channel/sender context into service calls instead of relying on global state.
- Use `saveAiRequestBuilder` (`src/service/common.ts`) when issuing LLM summarize/question requests.
- Guard optional integrations by config flags (`KAFKA_*`, `ELASTIC_*`) before network calls.

## ANTI-PATTERNS
- Do not register Discord event listeners in service files; routing belongs in `src/controller/`.
- Do not add deployable slash commands outside `src/service/commands/`.
- Do not leak raw provider errors directly to users; map user-facing text through error handlers.

## NOTES
- Child module docs exist for command-specific conventions: `src/service/commands/AGENTS.md`.
