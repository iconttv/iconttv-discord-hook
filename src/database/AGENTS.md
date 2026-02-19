# DATABASE KNOWLEDGE BASE

## OVERVIEW
`src/database/` defines Mongo connection setup and model boundaries used across runtimes.

## STRUCTURE
```text
src/database/
|- index.ts                # mongoose connection bootstrap
\- model/                  # schema/model definitions and indexes
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Mongo connection behavior | `src/database/index.ts` | Builds auth URL and sets mongoose debug mode |
| Message persistence contract | `src/database/model/MessageModel.ts` | Message/reaction/embedding fields + unique identity index |
| AI request logs | `src/database/model/AiRequestModel.ts` | Request/response storage for LLM calls |
| Guild-level permissions/settings | `src/database/model/GuildPermissionModel.ts`, `src/database/model/DiscordSettingModel.ts` | Feature and command access config |

## CONVENTIONS
- Keep schema/index definitions inside `src/database/model/` only.
- Maintain stable message identity key shape: `guildId + channelId + messageId`.
- Prefer additive schema changes over destructive field renames.

## ANTI-PATTERNS
- Do not construct ad hoc mongoose models outside `src/database/model/`.
- Do not change index uniqueness semantics without checking archive/service callers.
- Do not move connection logic into runtime entry files.

## NOTES
- Detailed model-level map lives in `src/database/model/AGENTS.md`.
