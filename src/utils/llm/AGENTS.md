# UTILS LLM KNOWLEDGE BASE

## OVERVIEW
`src/utils/llm/` is the text LLM boundary for summarization/question flows, remotely fetched prompt policies, and schema-constrained Discord output. Image generation lives in the sibling `src/utils/image/` module.

## STRUCTURE
```text
src/utils/llm/
|- index.ts                # summarize/question facade exports
|- openai.ts               # provider call orchestration and prompt loading
\- types.ts                # OpenAI JSON schema output contracts
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Summarize/question entrypoints | `src/utils/llm/index.ts` | Thin facade used by services |
| OpenAI-compatible call logic | `src/utils/llm/openai.ts` | Model selection, prompt fetch, logRequest hooks |
| Output schema contracts | `src/utils/llm/types.ts` | `SummarizeOutputSchemaOpenai`, `questionOutputSchemaOpenai` |
| Prompt policy source | `static/prompt-question.txt`, `static/prompt-summarization.txt`, `static/prompt-persona.txt` | Runtime fetches raw GitHub URLs, not local files |
| Shared provider contracts | `src/utils/openai.ts` | Model-list parsing, exact OpenRouter host detection, provider name, headers |
| Message serialization/rendering | `src/utils/message.ts` | JSONL input, JSON parsing, Discord jump links |
| Service cache/request storage | `src/service/messageService.ts`, `src/service/common.ts` | Five-minute summary cache and `saveAiRequestBuilder` |
| Detailed coding conventions | `docs/coding-conventions/ai-and-prompts.md` | Current contracts, independent LLM comparisons, limitations, edit checklist |

## CONVENTIONS
- Preserve `response_format: json_schema`, strict object schemas, required properties, and matching result types/formatters. Summary uses `topics[{topic,startMessageId}]` plus one `comment`; question uses `answer` and `startMessageIds`.
- Prompts live under root `static/`; there are no `src/utils/llm/*.txt` files. Fetch uses `config.GITHUB_BASEURL` (prod: `main`, otherwise: `develop`), not the current checkout or local filesystem.
- Use `convertMessagesToPrompt` for JSONL, `EMBEDDING_INPUT`/TEXT fallback, reactions, and laugh normalization. Input still contains sender names; output anonymization is a separate prompt policy.
- Keep 600-message sequential summary chunks, one randomly selected model per call, and prior raw JSON as a later system message. Question calls do not use this chunk loop.
- Reuse provider helpers in `src/utils/openai.ts`. OpenRouter-only headers and traces must not leak into unrelated providers; Google safety `extra_body` applies only to OpenRouter `google/` text models.
- Await the optional `LogAiRequest(provider, model, params, responseOrError)` callback on API success/failure, log callback failures without replacing the API result, and rethrow original API failures.
- Keep Korean output, no person-name/nickname output, question paraphrasing, and application-generated jump links. Persona applies to the summary comment, not topic content.

## ANTI-PATTERNS
- Do not replace strict schemas with free-form output or `json_object`, invent new result fields, or duplicate message/link formatters.
- Do not inline long text prompt policy in TS or assume local static edits immediately affect runtime fetches.
- Do not describe prompt-only anonymization as a runtime privacy validator or input redaction guarantee.
- Do not copy raw conversations into question output, remove name-leak constraints, or equate paraphrasing with deleting sensitive meaning.

## NOTES
- Summary has a `skipSystemPrompt` type field but does not consume it; question does consume it and still sends an empty system message with the output schema.
- Prompt HTTP status and output IDs are not validated here; JSON parsing is not full runtime schema validation. These are limitations, not recommended patterns.
- Service-owned cache and request records are distinct from provider traces and operational logs. Never add API keys or authorization headers to stored payloads.
- Detailed Korean guidance: [AI and prompts](../../../docs/coding-conventions/ai-and-prompts.md).
