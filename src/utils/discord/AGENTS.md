# UTILS DISCORD KNOWLEDGE BASE

## OVERVIEW
`src/utils/discord/index.ts` defines shared Discord context and payload builders used by service, repository, and Kafka paths.

## STRUCTURE
```text
src/utils/discord/
\- index.ts                # LogContext + message/embed/attachment helpers
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Log context schema | `src/utils/discord/index.ts` (`LogContext`) | Canonical shape for message metadata |
| Sender identity resolution | `src/utils/discord/index.ts` (`getSenderId`) | Handles `Message` vs `Interaction` paths |
| Context extraction | `src/utils/discord/index.ts` (`getLogContext`) | Guild/member/channel snapshot for downstream use |
| User embed payload | `src/utils/discord/index.ts` (`createUserProfileEmbed`) | Anonymous vs named rendering |
| Icon response payloads | `src/utils/discord/index.ts` (`createIconEmbedMessagePayload`, `createIconFileMessagePayload`) | Suppressed notification payloads |
| Image attachment conversion | `src/utils/discord/index.ts` (`base64ImageToAttachment`) | Base64 -> `AttachmentBuilder` |

## CONVENTIONS
- Build sender/channel metadata via helper functions; avoid re-deriving IDs from raw interaction fields in each service.
- Keep generated icon replies non-noisy by preserving `MessageFlags.SuppressNotifications` usage.
- Use ASCII attachment names (for example `image.png`) when constructing embed attachments.
- Preserve fallback behavior for missing guild/member/channel objects; downstream callers rely on empty-string defaults.

## ANTI-PATTERNS
- Do not inline custom `Message`/`Interaction` casts in feature code when helper methods already normalize both paths.
- Do not bypass `getLogContext` for Kafka or LLM logging payloads; field parity matters across consumers.
- Do not use localized/non-ASCII attachment filenames in embed payloads.

## NOTES
- This module is imported across service and repository boundaries; keep changes backward-compatible.
