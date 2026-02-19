# DATABASE MODEL KNOWLEDGE BASE

## OVERVIEW
`src/database/model/` is the source of truth for Mongo schema fields and indexes.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Canonical message schema | `src/database/model/MessageModel.ts` | Stores raw payload, reaction entries, embedding outputs |
| Message summarization cache | `src/database/model/MessageSummarizationModel.ts` | Channel/hour/count summary snapshots |
| AI request tracking | `src/database/model/AiRequestModel.ts` | Provider/model/params/response audit |
| Guild permission levels | `src/database/model/GuildPermissionModel.ts` | `level` contract (`0`, `3`, `10`) |
| Guild feature settings | `src/database/model/DiscordSettingModel.ts` | Resize/question-for-everyone flags |
| Guild user naming | `src/database/model/GuildUserNameModel.ts` | Name lookup support model |

## CONVENTIONS
- Export schema constants when reused by service/reaction logic.
- Keep reaction payload types aligned with service normalization code in `src/service/archive/reaction.ts`.
- Declare indexes near schema definitions and keep names/fields explicit.

## ANTI-PATTERNS
- Do not store denormalized variants of existing identity keys.
- Do not remove legacy fields used by embedding/search paths without migration.
- Do not weaken unique index guards for guild/channel/message identity.
