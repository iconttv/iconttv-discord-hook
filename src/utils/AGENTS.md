# UTILS KNOWLEDGE BASE

## OVERVIEW
`src/utils/` contains cross-cutting helpers for Discord payload/context shaping, LLM prompts, auth/error mapping, message normalization, and webhook/reporting.

Detailed conventions: [AI/prompts](../../docs/coding-conventions/ai-and-prompts.md), [Discord/payloads](../../docs/coding-conventions/discord-and-commands.md), [core/adapters](../../docs/coding-conventions/core-and-adapters.md).

## STRUCTURE
```text
src/utils/
|- discord/index.ts        # Discord payload + context helper surface
|- llm/                    # structured text requests/types; prompt sources are root static/
|- image/                  # OpenAI-compatible image generation (provider-specific API paths)
|- openai.ts               # model list, provider/headers, URL and trace helpers
|- auth.ts                 # guild permission gate helper
|- error.ts                # provider error to reply text mapper
|- message.ts              # message fetch/link helpers
|- webhook.ts              # operational webhook sender
|- index.ts                # generic text/time/url helpers
\- io.ts                   # filesystem/json utility helpers
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Discord message payloads | `src/utils/discord/index.ts` | Embed/file payload factories + `LogContext` |
| LLM prompt policy | `static/prompt-question.txt`, `static/prompt-summarization.txt`, `static/prompt-persona.txt` | Runtime fetch uses config.GITHUB_BASEURL, not local files |
| LLM runtime integration | `src/utils/llm/index.ts`, `src/utils/llm/openai.ts` | Prompt rendering + provider call |
| Permission gating helper | `src/utils/auth.ts` | GPT command eligibility checks |
| User-facing error text | `src/utils/error.ts` | Maps API errors into Korean replies |
| Message links/history | `src/utils/message.ts` | Fetch helpers and Discord jump links |
| Shared provider rules | `src/utils/openai.ts` | parseOpenAiModelList, OpenRouter hostname/headers, provider name, URL building |
| Image generation | `src/utils/image/openai.ts` | OpenRouter chat completions vs other providers' Responses image_generation tool |

## CONVENTIONS
- Keep utility contracts reusable across service/controller layers; avoid module-specific branching when possible.
- Use shared normalizers (`replaceLaughs`, `unreplaceLaughs`, `truncateText`) instead of duplicating text logic.
- Treat `static/prompt-*.txt` as runtime behavior policy; deployed requests fetch the configured main/develop raw GitHub URL. Editing local files alone does not change the remote response.
- Log failures in side-effecting utilities (`webhook`, provider wrappers, IO helpers).
- Reuse OpenAI helpers for comma-separated model lists, provider detection, attribution headers, and request URL construction; do not invent parallel env names.
- Distinguish prompt inputs (which may include sender names) from output anonymization and no-verbatim-copy policies.

## ANTI-PATTERNS
- Do not remove or weaken prompt constraints that block direct name/username leakage.
- Do not copy raw conversation text into generated QA/summarization output contracts; preserve source meaning rather than silently deleting sensitive wording.
- Do not add generic intro/outro boilerplate to embedding preprocess prompts.

## NOTES
- Deep Discord-specific contracts are documented in `src/utils/discord/AGENTS.md`.
- LLM integration contracts are documented in `src/utils/llm/AGENTS.md`.
