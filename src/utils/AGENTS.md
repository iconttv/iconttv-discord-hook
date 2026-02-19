# UTILS KNOWLEDGE BASE

## OVERVIEW
`src/utils/` contains cross-cutting helpers for Discord payload/context shaping, LLM prompts, auth/error mapping, message normalization, and webhook/reporting.

## STRUCTURE
```text
src/utils/
|- discord/index.ts        # Discord payload + context helper surface
|- llm/                    # prompt assets + OpenRouter call facade
|- image/                  # image generation facade
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
| LLM prompt policy | `src/utils/llm/prompt-question.txt`, `src/utils/llm/prompt-summarization.txt` | Output safety + formatting rules |
| LLM runtime integration | `src/utils/llm/index.ts`, `src/utils/llm/openrouter.ts` | Prompt rendering + provider call |
| Permission gating helper | `src/utils/auth.ts` | GPT command eligibility checks |
| User-facing error text | `src/utils/error.ts` | Maps API errors into Korean replies |
| Message links/history | `src/utils/message.ts` | Fetch helpers and Discord jump links |

## CONVENTIONS
- Keep utility contracts reusable across service/controller layers; avoid module-specific branching when possible.
- Use shared normalizers (`replaceLaughs`, `unreplaceLaughs`, `truncateText`) instead of duplicating text logic.
- Treat `src/utils/llm/*.txt` as runtime behavior policy, not comment-only docs.
- Log failures in side-effecting utilities (`webhook`, provider wrappers, IO helpers).

## ANTI-PATTERNS
- Do not remove or weaken prompt constraints that block direct name/username leakage.
- Do not copy raw conversation text into generated QA/summarization output contracts.
- Do not add generic intro/outro boilerplate to embedding preprocess prompts.

## NOTES
- Deep Discord-specific contracts are documented in `src/utils/discord/AGENTS.md`.
- LLM integration contracts are documented in `src/utils/llm/AGENTS.md`.
