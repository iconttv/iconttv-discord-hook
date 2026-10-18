# UTILS DISCORD KNOWLEDGE BASE

## OVERVIEW
`index.ts` supplies shared Discord metadata, identity filters, member resolution, and message payload builders. Detailed field contracts and black-box comparisons: [Discord and commands conventions](../../../docs/coding-conventions/discord-and-commands.md).

## WHERE TO LOOK
| Task | Symbols | Notes |
|------|---------|-------|
| Shared metadata | `LogContext`, `getLogContext` | Async extraction; flat fields and Date timestamp, message/interaction differences |
| Sender resolution | `getSenderId`, `getSenderName`, `getAvatarUrl` | Message/interaction normalization and guild-member fallback policies |
| Member lookup | `getGuildMember`, `resolveGuildMember` | Cache then API; missing IDs or fetch failures resolve undefined |
| Persistence identity | `MessageIdentityFilter`, `getMessageIdentityFilter`, `getMessageIdentityFilterFromMessage` | All three guild/channel/message IDs required; null when incomplete |
| User profile | `createUserProfileEmbed` | Async; named or anonymous author, DarkBlue, original timestamp |
| Icon payloads | `createIconEmbedMessagePayload`, `createIconFileMessagePayload` | Remote/local branches, notification suppression |
| Attachment conversion | `base64ImageToAttachment` | Data URL or bare base64; ASCII filename, optional SPOILER_ prefix |
| Original deletion | `deleteMessage` | Checks deletable and logs/swallow failures; resolved Promise does not prove deletion |

## CONVENTIONS
- Reuse helpers instead of recreating sender/member/context schemas in services. Await async context and payload builders.
- Preserve `LogContext` flat fields, arrays, and `createdAt: Date`. Attachments are JSON-converted; current embeds/components retain Discord objects. Channel context prunes large guild collections.
- Treat empty-string metadata defaults as unavailable data. A non-null context is not proof of a complete identity.
- Use the identity helpers for persistence filters. They require nonempty guildId/channelId/messageId but do not validate Snowflake syntax. Do not filter mutations by messageId alone.
- `getSenderId` includes a user fallback that `getLogContext.senderId` does not always preserve. Do not assume the two results are identical when membership is unavailable.
- Preserve `MessageFlags.SuppressNotifications` on icon replies; this is not ephemeral visibility or complete mention suppression.
- Use ASCII attachment names and identical `attachment://` references; retain the actual extension. Generated-image spoiler attachments should not silently become visible image embeds.
- Reuse the existing anonymous author policy (telecom-style name and default avatar). Anonymous display does not anonymize internal LogContext.
- When changing shared contracts, update all affected consumers together rather than introducing parallel schemas or compatibility aliases.

## CURRENT RISKS
- `Message`/`PartialMessage` support is explicit on identity/member helpers, not a blanket guarantee that every payload builder handles partial input.
- `getLogContext` can return populated objects with missing sender/guild/channel values. Preserve explicit guards at service/storage boundaries.
- `src/service/iconService.ts` currently starts sending and original deletion separately; do not copy this race. New send/delete sequencing should confirm send success first.
- A TextChannel cast is not a runtime channel guard, and helper extraction is not a bot-message filter.
