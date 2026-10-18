# SERVICE EMBEDDING KNOWLEDGE BASE

## OVERVIEW
`src/service/embedding/` returns searchable text and vector fields for Discord artifacts. Mongo persistence belongs to archive/CLI callers. See [archive and persistence conventions](../../../docs/coding-conventions/archive-and-persistence.md) and [AI and prompt conventions](../../../docs/coding-conventions/ai-and-prompts.md).

## WHERE TO LOOK
| Task | Location / symbol | Notes |
|------|-------------------|-------|
| Artifact preprocessing | `discord_processor.ts` / `processMessage` | Partial `TEXT_*` / `EMBEDDING_*` results, null for missing identity |
| Combined embedding input | `discord_processor.ts` / `calculateEmbedding` | Text, attachment, component, embed block order |
| Provider calls and prompts | `client.ts` / `aiClient` | Embedding, vision, extraction and tracing |
| Utility behavior | `toolkit.ts` | URL/image/text conversion and emoji normalization |
| Failed URL store | `failure_urls.ts` / `databaseSqlite` | Import-time SQLite open, WAL and prepared statements |

## CONVENTIONS
- Keep `TEXT_MESSAGE` and artifact `Map<string, string>` fields aligned with `MessageModel`; do not flatten them into a new storage contract.
- Preserve `calculateEmbedding` headers and text/attachment/component/embed ordering. Model metadata comes from config, dimension from the returned vector length.
- Distinguish absent status (no result assigned), false (embedding unavailable/failed), true (embedding returned), and Mongo's nullable default. Artifact failures can coexist with successful embeddings.
- Attachments support `image/` and `text/` content types; do not infer extension support. Components currently log and skip. Embeds process selected metadata and thumbnail captions, not arbitrary URL bodies.
- Check the failed URL store before attachment/thumbnail requests; log failures and preserve other successful preprocessing results.
- Keep extraction prompts free of user-facing intro/outro wrappers. Review provider/prompt changes against the linked AI conventions.
- OCR/document summaries use `getChatCompletionText` to keep only final text; OpenRouter requests set `reasoning: { exclude: true }` without disabling reasoning or forcing effort. Keep reasoning out of stored searchable text.
- Embedding and Vision SDK clients are independently lazy and cached. Importing aiClient must not require credentials for either feature; actual calls still require valid authentication. Do not supply fabricated API keys.

## LIMITATIONS AND SIDE EFFECTS
- Importing `failure_urls.ts` creates/opens `./database/failure_urls.db`; do not import it just to inspect behavior or document the module.
- Failed URLs are permanently skipped without TTL, automatic retry or stored reason. Inserts use `INSERT OR IGNORE`; unsupported attachment skips are not cached failures.
- `close()` is idempotent; reads/inserts after close throw. The archive entrypoint currently does not close this store.
- `processMessage` does not persist intermediate Mongo results. Callers explicitly copy returned fields, and message edits currently do not invoke it.
- CLI embedding repair defaults to null status, not false, and reuses saved embedding input/text rather than re-fetching all artifacts.
