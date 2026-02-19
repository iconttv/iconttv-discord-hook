# SERVICE EMBEDDING KNOWLEDGE BASE

## OVERVIEW
`src/service/embedding/` converts Discord message artifacts into searchable text and vector embeddings.

## STRUCTURE
```text
src/service/embedding/
|- client.ts               # OpenAI clients: embedding + vision/summary
|- discord_processor.ts    # message/attachment/embed preprocessing
|- toolkit.ts              # URL/image/text utility functions
\- failure_urls.ts         # SQLite failed-url store
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| End-to-end message processing | `src/service/embedding/discord_processor.ts` | Produces `TEXT_*` and `EMBEDDING_*` fields |
| Provider calls and prompts | `src/service/embedding/client.ts` | OCR/summary prompts + embedding creation |
| URL/image utility behavior | `src/service/embedding/toolkit.ts` | URL liveness, data URL decode, markdown conversion |
| Failed URL dedupe store | `src/service/embedding/failure_urls.ts` | WAL SQLite table + `INSERT OR IGNORE` |

## CONVENTIONS
- Keep preprocess prompts concise and free of intro/outro boilerplate.
- Use `databaseSqlite` failed URL checks before repeated network/image processing.
- Keep `TEXT_MESSAGE`, `TEXT_ATTACHMENTS`, `TEXT_COMPONENTS`, `TEXT_EMBEDS` contract stable for downstream search.

## ANTI-PATTERNS
- Do not add user-facing narrative wrappers to extracted OCR/summarized text.
- Do not remove fallback behavior from URL reader (`Jina` -> direct fetch).
- Do not silently swallow preprocessing/provider failures without logging.
