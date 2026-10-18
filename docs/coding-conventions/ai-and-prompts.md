# AI 호출과 프롬프트 코딩 컨벤션

[컨벤션 인덱스](README.md) · [공통 경계와 어댑터](core-and-adapters.md) · [Discord와 명령](discord-and-commands.md) · [아카이브와 영속화](archive-and-persistence.md)

이 문서는 **현재 관찰된 계약**, **설정 규칙**, **주의사항**, **권장 방향**을 구분한다. 독립 LLM 구현은 비교 자료이며 실행하거나 런타임 코드에 적용하지 않았다. 다른 설계 자체를 일반적인 오답으로 취급하지 않는다.

## 1. 기능 요구와 코드 경계

### 요구사항

- 저장된 Discord 메시지를 한국어로 요약하고, 질문에 답하면서 근거 메시지로 이동할 수 있어야 한다.
- 생성 출력에서 작성자 이름·닉네임 등 개인 식별 정보를 드러내지 않는다. 질문 답변은 원문을 그대로 복사하지 않고 재구성한다.
- 요약은 주제와 별도 코멘트를 제공하고, 질문은 답변과 관련 메시지 식별자를 제공한다.
- 텍스트 또는 참조 이미지와 텍스트로 이미지를 생성하고 Discord 첨부파일로 보낸다.
- 모델/접속 설정과 공급자별 요청 형식을 보존하고, 요청 기록 실패가 핵심 호출 실패를 덮어쓰지 않게 한다.

### 관찰된 계약: 레이어별 책임

| 경계 | 근거 경로·심볼 | 책임과 반환 |
|---|---|---|
| 대화 서비스 | [`messageService.ts`](../../src/service/messageService.ts), `summarizeLastMessages`, `questionLastMessages` | 메시지 조회, Discord context, 로그 콜백 구성, 요약 캐시, 웃음 복원 |
| 텍스트 AI facade | [`llm/index.ts`](../../src/utils/llm/index.ts), [`llm/openai.ts`](../../src/utils/llm/openai.ts), `summarizeMessages`, `questionMessages` | 원격 프롬프트, 모델 선택, 구조화 요청, 응답 포맷; `Promise<string \| undefined>` |
| 출력 스키마 | [`llm/types.ts`](../../src/utils/llm/types.ts), `SummarizeOutputSchemaOpenai`, `questionOutputSchemaOpenai` | provider에 전달하는 strict JSON schema와 TS 결과 타입 |
| 메시지 변환 | [`message.ts`](../../src/utils/message.ts), `convertMessagesToPrompt`, `constructSummarizationResult`, `constructQuestionResult` | JSONL 입력, JSON 파싱, Discord jump URL 합성 |
| 이미지 서비스 | [`imageService.ts`](../../src/service/imageService.ts), `generateImageFromUser` | 요청자/서버/채널 정보를 저장 콜백에 캡처 |
| 이미지 AI | [`image/openai.ts`](../../src/utils/image/openai.ts), `generateImage` | 공급자별 API, 이미지 정규화; `Promise<[string, string[]]>`의 첫 값은 모델명 |
| 이미지 명령 | [`commands/imageGeneration.ts`](../../src/service/commands/imageGeneration.ts), `execute` | 참조 이미지 전처리, 지연 응답, 스포일러 첨부파일, 오류 응답 |
| 공통 공급자 | [`utils/openai.ts`](../../src/utils/openai.ts) | 모델 목록/공급자 식별/OpenRouter 헤더/요청 URL 규칙 |
| 요청 저장 | [`service/common.ts`](../../src/service/common.ts), `saveAiRequestBuilder` | `AiRequestModel`에 요청 메타데이터와 공급자 응답/오류 저장 |

서비스는 Discord trigger와 영속화 정보를 알고, utility는 전달된 messages/context/callback으로 호출한다. utility 내부에서 interaction 응답이나 별도 DB 저장을 새로 구현하지 않는다.

## 2. 텍스트 입력·스키마·출력

### 관찰된 계약: 입력은 JSONL이다

`convertMessagesToPrompt`는 `senderName`, `messageId`, `EMBEDDING_INPUT` 또는 `message`가 문자열인 메시지만 사용한다. `EMBEDDING_INPUT`을 우선하고 없으면 `# TEXT\n${msg.message}`를 만든다. `replaceLaughs` 후 다음 필드를 메시지당 하나의 JSON 객체로 직렬화하고 줄바꿈으로 연결한다.

```ts
{
  senderName: msg.senderName,
  createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
  messageId: msg.messageId,
  content: messageContent,
  reactions: convertReactions(msg.reactions),
}
```

반응은 `emoji`, `count`, `users`이며 반응 사용자 이름도 입력에 포함된다. **출력 익명화 요구는 모델에 이름을 보내지 않는다는 뜻이 아니다.** 작성자 구분과 반응 맥락은 입력에 남는다. `EMBEDDING_INPUT`에는 TEXT뿐 아니라 ATTACHMENT/COMPONENT/EMBED 등 전처리된 의미가 들어갈 수 있으므로 `message`만 뽑는 대체 구현은 내용을 잃는다.

`getLastMessages`는 hours가 있으면 시간 조회를 우선하고 없으면 count 조회를 사용한다. 둘 다 없으면 빈 배열이다. 조회에서는 명령 타입·삭제 메시지를 제외하고, 시간 역순 조회 결과를 뒤집어 시간순으로 전달한다. 이후 내용이 없거나 senderName이 `iconttv-`로 시작하는 메시지를 제외한다. 이 조회 책임을 AI wrapper에 중복시키지 않는다.

### 관찰된 계약: JSON schema를 공유한다

요약은 `response_format: { type: 'json_schema', json_schema: SummarizeOutputSchemaOpenai }`를 사용한다.

```ts
interface SummarizationOutput {
  topics: { topic: string; startMessageId: string }[];
  comment: string;
}
interface QuestionOutput {
  answer: string;
  startMessageIds: string[];
}
```

스키마는 `strict: true`, 객체의 `additionalProperties: false`, 명시적 `required`를 가진다. 요약의 `comment`는 전체 결과에 하나이며 각 topic의 comment가 아니다. 질문의 빈 `startMessageIds`는 관련 메시지가 없는 경우 허용된다. 최대 6개 주제, topic/comment 각 100자 목표, answer 800자 목표와 근거 최대 3개는 **프롬프트 규칙**이지 JSON schema나 최종 Discord 메시지 길이의 강제 검증이 아니다. 손으로 작성된 schema를 기존 타입과 함께 변경해야 하며 `json_object`로 바꾸는 것은 동등한 제약이 아니다.

`constructSummarizationResult`는 `- 주제 https://discord.com/channels/{guild}/{channel}/{startMessageId}` 목록과 빈 줄 뒤 코멘트를 만든다. 주제가 없으면 안내문을 쓴다. `constructQuestionResult`는 답변과 빈 줄 뒤 근거 URL들을 만든다. 모델이 전체 URL을 생성하는 대신 애플리케이션의 `getMessageLink`가 URL을 합성한다. 모델이 돌려준 ID가 입력에 실제 존재하는지는 현재 별도 검증하지 않는다.

두 생성 함수는 결과 뒤에 `\n(${model})`을 붙인다. 질문 응답 content가 없으면 `undefined`; 요약은 content가 없으면 반복을 중단하고 결과 formatter의 빈 요약 안내문을 사용할 수 있다. `unwrapJsonBlocks`는 앞의 ```` ```json ````과 뒤의 ```` ``` ````을 제거하지만 일반적인 JSON 복구기나 런타임 schema validator가 아니다. 파싱 실패를 감춘 성공 응답으로 바꾸지 않는다.

### 관찰된 계약: 청크와 sampling

`summarizeMessages`는 `makeChunk(messages, 600)`으로 나누고 **호출당 한 번 고른 모델**로 청크를 순차 처리한다. 두 번째 청크부터 이전 JSON을 `assistant` 메시지로 전달한다. 프롬프트는 이를 이전 구간의 누적 결과로 설명하며 새 기록과 병합한 전체 결과를 요구한다. 이전 모델 출력을 system 지시로 승격하거나 `<prev>` 태그에 의존하지 않는다. 입력 JSONL과 `Summarize given chats.`를 각각 user 메시지로 보낸다. 질문은 전체 JSONL과 마지막 질문을 별도 user 메시지로 보내며 같은 청크 루프를 쓰지 않는다.

공통 sampling 범위는 `frequency_penalty`가 `[0.5, 0.6)`, `presence_penalty`가 `[-0.3, -0.1)`, `temperature`가 `[0.5, 0.7)`이다. 청크 경계·역할 순서·샘플링은 현재 payload 계약이며 단순한 스타일 취향으로 변경하지 않는다.

## 3. static 프롬프트와 익명화 의미

### 설정 규칙: 로컬 파일과 실제 로딩을 구분한다

정책 원본은 [`static/prompt-summarization.txt`](../../static/prompt-summarization.txt), [`static/prompt-question.txt`](../../static/prompt-question.txt), [`static/prompt-persona.txt`](../../static/prompt-persona.txt)이다. **`src/utils/llm/*.txt` 파일은 없다.**

[`config.ts`](../../src/config.ts)의 `GITHUB_BASEURL`은 `https://raw.githubusercontent.com/iconttv/iconttv-discord-hook/` 뒤에 `NODE_ENV === 'prod'`이면 `main`, 그 외에는 `develop`을 붙인다. `openai.ts`는 여기에 `/static/...`를 연결해 `fetch(...).then(res => res.text())`한다. 로컬 static 수정이 로컬 실행에 자동 반영되거나 현재 checkout branch를 읽는다고 설명하면 안 된다.

- 요약: 요약 정책과 persona를 `Promise.all`로 동시에 fetch한다. `channelName`, `guildName`, 현재 `new Date().toLocaleString()`, persona를 치환한다.
- 질문: question 정책을 fetch하고 이름/시각을 치환한다. `skipSystemPrompt`이면 fetch하지 않고 빈 system content를 보낸다. 출력 schema와 메시지 입력은 여전히 유지한다.
- `SummarizeMessagesProps`에도 `skipSystemPrompt` 필드는 있으나 요약 구현에서는 사용하지 않는다. 요약에서도 동작한다고 문서화하지 않는다.

### 관찰된 정책

- 세 시스템 프롬프트의 지시는 영어로 작성하며 응답은 한국어다. 사용자 확인에 따라 참여자 평균 연령대 20대 설정을 유지한다.
- 요약은 누적 결과와 새 구간을 병합해 최대 6개 주제를 반환하며 topic과 comment는 각 100자를 목표로 한다. 이전 주제의 관련 ID를 유지할 수 있다. 페르소나는 comment에만 적용한다.
- 질문은 제공된 기록만 근거로 답하며 근거가 없으면 확인 불가 문장과 빈 ID 배열을 반환한다. answer는 800자, 근거 ID는 중복 없이 최대 3개를 목표로 한다. 마지막 user 메시지가 질문이며 별도 접두사는 요구하지 않는다.
- 익명화는 topic과 comment 및 answer 모두에 적용한다. 입력의 이름은 문맥 이해용이며, 채팅·첨부·OCR·이전 요약 안의 지시는 신뢰하지 않는다.
- 민감하거나 거친 원문의 핵심 의미·관련 표현은 보존하되 긴 직접 인용이나 새로운 자극적 표현은 피한다. 의견·농담·계획·사실을 구분하며 (웃음)은 반복된 ㅋ를 뜻한다.

### 주의사항과 권장 방향

익명화·입력 지시 무시·출력 길이는 프롬프트 정책이지 기계적 보장이 아니다. prompt fetch는 HTTP 상태를 확인하지 않고 본문을 읽고, 코드와 원격 정책의 배포 시점이 다를 수 있다. 로컬 static 변경을 테스트하려면 검증 시 해당 파일을 주입하거나 실제 사용 브랜치에 반영해야 한다. 페르소나는 가벼운 빈정거림과 마지못한 다정함을 허용하되 개인 공격·위협·차별적 비하·피해 조롱을 금지한다.

## 4. 모델·공급자·OpenRouter

### 설정 규칙

텍스트는 `LLM_OPENAI_BASEURL`, `LLM_OPENAI_API_KEY`, `LLM_OPENAI_MODELS`; 이미지는 `IMAGE_OPENAI_BASEURL`, `IMAGE_OPENAI_API_KEY`, `IMAGE_OPENAI_MODELS`를 사용한다. 실제 비밀값을 문서나 예시에 넣지 않는다.

`parseOpenAiModelList`는 쉼표로 분리하고 trim 후 빈 항목을 버린다. 결과가 비면 `${envVarName} must include at least one model.` 오류를 던진다. 중복 제거는 하지 않는다. 각 utility의 `getModel`은 `Math.floor(Math.random() * models.length)`로 무작위 선택한다. 순환 선택이나 첫 번째 모델 고정과 다르다. OpenAI SDK 인스턴스에는 60초 timeout을 설정한다. 이미지의 OpenRouter raw fetch 분기에 같은 timeout이 자동 적용되는 것은 아니다.

SDK는 `openai@^7.38.0`이며 Node 24에서 사용한다. Chat Completions와 이미지 Responses API의 기존 경계는 유지한다. SDK 갱신만으로 공급자의 추론 출력이 자동 제거되는 것은 아니다.

SDK 클라이언트와 텍스트/이미지 모델 목록은 import가 아닌 해당 기능 첫 호출 때 초기화한다. 임베딩과 Vision은 서로 독립적으로 생성·재사용한다. AI 설정이 전혀 없어도 CLI 도움말과 미사용 기능 import는 동작한다. 실제 API 호출의 인증 요구는 그대로이며 가짜 키·무인증 fallback으로 우회하지 않는다. 검증은 [`tests/openai-initialization.test.ts`](../../tests/openai-initialization.test.ts)의 격리 subprocess에서 수행한다.

### 추론 수행과 사용자 출력 분리

- OpenRouter의 텍스트·Vision·문서 요약·이미지 요청에는 `reasoning: { exclude: true }`를 보낸다. 이전 `include_reasoning: true`는 사용하지 않는다. 다른 OpenAI 호환 endpoint에 이 전용 필드를 보내지 않는다.
- `reasoning_level: none`, `reasoning_effort: none`, `enabled: false`로 추론을 끄지 않는다. 모델마다 허용되는 effort가 다르므로 `low`/`medium`도 일괄 강제하지 않고 모델 기본 추론 수준을 유지한다. 출력 제외는 추론 과금·토큰 사용량 감소를 보장하지 않는다.
- `getChatCompletionText`는 `message.content` 문자열 또는 `text`/`output_text` part만 사용한다. `reasoning`, `reasoning_content`, `reasoning_details`, thinking part를 최종 답변으로 합치거나 content가 비었을 때 fallback하지 않는다.
- `stripReasoningText`는 명시적인 `<think>`, `<thinking>`, `<reasoning>` 블록을 중첩까지 제거한다. 닫히지 않았거나 잘못 닫힌 블록의 숨겨진 꼬리를 노출하지 않는다. 일반 문장 속 thinking/reasoning 단어를 추측해서 지우지 않는다.
- 제거한 블록은 태그 포함 원문으로 `logger.debug`에 기록한다. 중첩 블록은 최상위 블록당 한 번, 미완성 블록은 제거된 끝부분까지 기록하며 일반 답변만 있는 경우에는 기록하지 않는다. 추론에는 대화 원문·민감정보가 있을 수 있고 현재 logger는 운영 환경에서도 debug를 기록하므로 로그 접근·보관에 유의한다.
- JSON 바깥의 태그는 파싱 전에 제거하고, JSON의 answer/topic/comment 필드는 표시 전에 다시 정제한다. 요약 청크 사이의 이전 응답과 기존 요약 캐시 반환도 추론 블록을 제외한다. 원시 공급자 응답의 감사 기록은 기존대로 보존할 수 있다.
- 명시 태그를 답변의 예시로 쓴 경우도 제거될 수 있다. 표시 구분이 전혀 없는 일반 텍스트 추론은 확실하게 분류할 수 없다. 최종 답변 자체가 2000자를 넘는 문제는 별개이며 이번 변경은 답변 자르기·분할 전송을 추가하지 않는다.

근거: [`src/utils/openai.ts`](../../src/utils/openai.ts), [`tests/openai-output.test.ts`](../../tests/openai-output.test.ts), [OpenRouter reasoning 문서](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [SDK 변경 이력](https://github.com/openai/openai-node/blob/master/CHANGELOG.md).

### 관찰된 계약: 공유 helper를 사용한다

[`utils/openai.ts`](../../src/utils/openai.ts)의 `isOpenRouterBaseUrl`은 유효한 URL의 **hostname이 정확히 `openrouter.ai`인지** 확인한다. 문자열 포함 검사나 `google/` 모델명만으로 공급자를 판정하지 않는다.

- `getOpenRouterHeaders`는 해당 host에만 `HTTP-Referer: https://github.com/iconttv`, `X-Title: iconttv-discord`를 제공한다. 일반 endpoint에 OpenRouter 전용 헤더를 전파하지 않는다.
- `getOpenAiProviderName`은 OpenRouter이면 `openrouter`, 다른 유효 URL이면 hostname, 없거나 잘못된 URL이면 `openai-compatible`을 돌려준다. 설정 URL이 잘못되었을 때 이 helper가 API 연결까지 정상화하는 것은 아니다.
- `buildOpenAiRequestUrl`은 base URL의 trailing slash와 path의 leading slash를 정리해 `/v1` 등의 base path를 유지한다.
- 텍스트 OpenRouter 호출은 `trace_id: ${guildId}_${channelId}_${context?.messageId}`와 `trace_name`, `span_name`, `generation_name`을 보낸다. 요약 이름은 `Chat Summarization` / `Summarization Step` / `Generate Summary`, 질문은 `Question` / `Question Step` / `Generate Answer`다. context가 없으면 ID에 `undefined`가 포함될 수 있다. 이미지 utility에는 동일 trace 필드가 없다.
- 텍스트에서는 **OpenRouter이면서 `google/` 모델**일 때만 `extra_body`로 provider ignore 및 Google safety settings를 붙인다. 이미지 chat 분기는 `provider`와 `google`를 top-level payload에 붙인다. 두 API 형태를 섞지 않는다.

Google 분기는 `Google AI Studio`를 ignore하며, HARASSMENT/HATE_SPEECH/SEXUALLY_EXPLICIT/DANGEROUS_CONTENT/CIVIC_INTEGRITY의 threshold를 `BLOCK_NONE`으로 둔다. 이미지에는 `google.tools: [{ google_search: {} }]`도 있다. 공급자 지원 여부를 확인하지 않고 일반 OpenAI endpoint로 복제하는 것은 레포의 분기 계약에 맞지 않는다.

## 5. 캐시·요청 저장·오류

### 관찰된 계약: 요약 캐시는 서비스 소유다

`summarizeLastMessages`는 guild/channel/sender가 없으면 반환한다. 캐시는 `guildId`, `channelId`, `hours`, `count`, 최근 5분의 `createdAt` 조건으로 조회하고 최신 하나를 사용한다. senderId는 캐시 조회 키가 아니다. 캐시 hit이면 `(최근 5분 이내 응답에서 캐시됨)`을 덧붙이고 AI 호출을 하지 않는다. miss에서는 메시지를 조회하고 context를 만든 뒤 utility를 부른다. 결과가 있으면 `MessageSummarizationModel`에 저장하고 저장 실패는 `logger.error` 처리한다. 질문 서비스에는 이 요약 캐시가 없다.

새 요약 결과는 저장 후 `unreplaceLaughs`해서 반환하지만 캐시 hit은 저장된 값에서 추론 태그만 제거해 반환한다. 따라서 모든 경로에서 웃음 복원이 동일하다고 보장하면 안 된다. 이 차이를 새로운 컨벤션으로 권장하지 않는다.

### 관찰된 계약: callback의 인자와 실패 격리

[`type/index.ts`](../../src/type/index.ts)의 `LogAiRequest`는 `(provider, modelName, aiParams, response) => Promise<void>`다. 별도 onRequest/onResponse/onFailure API가 아니다. `saveAiRequestBuilder(guildId, channelId, senderId, discordParams)`가 이를 구현하여 `AiRequestModel`에 위 인자와 Discord 정보를 함께 저장한다.

- 요약 서비스의 `discordParams`는 `{ hours, count }`, 질문은 `{ question, count }`, 이미지는 `{ prompt }`다.
- 텍스트 utility는 API 성공 결과와 실패 객체 모두에 callback을 호출하고, callback 실패는 `logger.error`로 기록한다. 원래 API 실패는 다시 throw한다.
- 비-OpenRouter 이미지 Responses 호출도 성공/실패 양쪽을 기록하고 로그 실패를 격리한다.
- **OpenRouter 이미지 분기는 현재 HTTP 실패 응답을 기록하지만 성공 응답은 callback에 저장하지 않는다.** 네트워크/JSON 파싱/이미지 추출 실패도 같은 실패 callback으로 모두 포괄하는 구조가 아니다. 모든 분기의 감사 로그가 완전하다는 잘못된 설명을 피한다.
- 생성 이미지 수는 `logger.info`, 명령의 프롬프트·참조 첨부 존재 여부는 `logger.debug`로 남는다. trace·운영 로그·Mongo 요청 기록은 서로 다른 경로다.

### 주의사항과 권장 방향

`aiParams`에는 프롬프트/대화가, response에는 공급자 결과가 저장될 수 있다. 출력 익명화 정책이 DB 로그의 익명화까지 의미하지 않는다. Authorization/API key를 로그 payload에 추가하지 않는다. 로그 필드/콜백의 변경은 기존 저장 모델과 모든 caller를 함께 고려해야 한다. OpenRouter 성공 로그 누락의 해결은 별도 동작 변경으로 검토할 사항이지 복제할 관례가 아니다.

## 6. 이미지 멀티모달 계약과 포맷

### 관찰된 계약: 입력과 출력 레이어를 분리한다

`/itvimgen`은 필수 `p`, 선택 `iedit`, `iref1`, `iref2`, `iref3`를 받는다. 각 첨부의 proxyURL은 [`embedding/client.ts`](../../src/service/embedding/client.ts)의 `aiClient.imageToBase64(..., 1024)`로 전처리해 순서대로 전달한다. 이 helper는 sharp로 비율을 유지하며 width를 제한하고 확대하지 않는다. 참조 입력은 실무 호출에서 HTTP URL만이 아니라 **data URL**일 수 있다.

이미지 utility의 반환은 `[model, images]`이며 images는 문자열 배열이다. 모델의 설명 텍스트를 정상 성공 결과로 노출하는 API가 아니다. utility에서 바로 Buffer/AttachmentBuilder를 반환하지 않는다.

### 관찰된 계약: 공급자별 API

| 항목 | OpenRouter | 비-OpenRouter |
|---|---|---|
| 호출 | raw `fetch(buildOpenAiRequestUrl(baseURL, 'chat/completions'))` | SDK `openai.responses.create` |
| 지시 | developer message | `instructions` |
| 사용자 입력 | `text`, `image_url` part 배열 | `input_text`, `input_image` (`detail: 'auto'`) 배열 |
| 이미지 요청 | `modalities: ['image', 'text']`, `reasoning: { exclude: true }` | `tools: [{ type: 'image_generation' }]`, 강제 `tool_choice` |
| 결과 | 첫 choice의 `message.images[].image_url.url` | output에서 `type === 'image_generation_call'`의 `result` |
| 이미지 없음 | 정제된 최종 content 또는 `no image response` 오류 | 추론 태그를 제외한 output_text 또는 `no image response` 오류 |

공통 지시의 최대 해상도 1080px은 텍스트 지시이며 강제 resize/검증 코드가 아니다. 두 API 모두 실제 이미지가 없으면 성공으로 처리하지 않는다. OpenRouter는 `message.content`를 오류 메시지로 활용하지만 정상 반환 텍스트로 보존하지 않는다.

### 관찰된 계약: 정규화와 Discord 파일

`normalizeGeneratedImage`는 data URL이나 HTTP(S)가 아닌 문자열을 그대로 반환한다. HTTP(S) 이미지 URL은 fetch하여 `data:{content-type};base64,{payload}`로 바꾸고, Content-Type이 없으면 `image/png`를 사용한다. Responses 결과는 raw base64 문자열 그대로 반환한다. 따라서 반환 배열의 문자열을 무조건 HTTP URL이라고 취급하거나 모두 data URL이어야 한다고 가정하지 않는다.

명령 adapter는 [`discord/index.ts`](../../src/utils/discord/index.ts)의 `base64ImageToAttachment(image, { spoiler: true })`로 변환한다. helper는 raw base64에 기본 `data:image/png;base64,`를 붙이고 `base64,` 뒤를 Buffer로 디코딩한다. 기본 파일명은 `SPOILER_image.png`; `ext` 기본값은 `png`이며 data URL의 MIME에서 확장자를 자동 추론하지 않는다. 실제 JPEG/WebP 데이터가 PNG 파일명으로 전달될 수 있는 현재 한계이지 모든 출력이 PNG로 재인코딩된다는 보장이 아니다. 생성 텍스트 대신 사용자 프롬프트·모델·소요 시간을 프로필 embed 설명에 표시한다.

## 7. 독립 LLM 요청과 실제 비교

### 독립 요청 방식

`completion(prompt, system=...)`을 두 번 별도로 호출했다. 이 API는 stateless이며 도구·레포·대화 이력이 없는 별도 요청이다. 다음 공통 system 지시와 기능 요구만 제공했고 실제 파일 경로, helper 이름, schema 필드명, 관례, 기대 오답은 제공하지 않았다. 아래 발췌는 응답 원문 그대로이며, 뒤의 올바른 형태는 현재 레포에 맞춰 따로 작성한 예시다. 원문 구현을 실행하거나 적용하지 않았다.

공통 system 원문:

> 당신은 레포 파일, 소스, 기존 관례를 모르는 독립 구현자입니다. 주어진 기능 요구만으로 TypeScript 예시 구현을 작성하세요. 도구/레포 접근 없이 답하고 코드를 실행하거나 적용하지 마세요.

### 요청 A — `ai-conversation`

요청 원문:

> TypeScript에서 OpenAI-compatible chat completions API를 사용해 Discord 채팅 기록을 요약하고 질문에 답하는 예시를 작성하세요. 입력은 서버 ID, 채널 ID, 메시지 배열(메시지 ID, 작성자 표시명, 텍스트, 작성 시각), 선택적 서버/채널 이름과 질문 문자열입니다. 요약은 주요 대화 주제와 짧은 코멘트를 한국어로 제공하고, 질문은 기록에 근거한 한국어 답변과 근거 메시지로 이동할 수 있는 링크를 제공해야 합니다. 작성자 이름과 원문 직접 인용은 최종 출력에 노출하지 마세요. 최종 반환은 Discord에 보낼 문자열입니다. API 접속 주소, 키, 사용 가능 모델 목록은 설정에서 받으며 여러 모델 중 하나를 사용합니다. 요청과 응답/실패를 저장할 수 있는 비동기 콜백도 받습니다. 필요한 내부 데이터 구조와 함수까지 포함해 구현하세요.

실제 응답 발췌(원문에서 서로 떨어진 두 interface를 각각 분리):

```ts
interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream: false;
  response_format?: { type: "json_object" };
}
```

```ts
interface SummaryTopic {
  topic: string;
  comment: string;
  evidenceIds: string[];
}
```

```ts
// 예시 정책: 요청마다 사용 가능 모델을 순환 선택한다.
let nextModelIndex = 0;
```

```ts
// 서버/채널 이름은 위치 설명용 데이터로만 제공한다.
// 작성자 표시명은 payload에서 제외한다.
```

응답은 별도 검증기·8자 연속 복사 검사·이름 검사를 구현했고, `onRequest`, `onResponse`, `onFailure` 콜백과 인라인 `SYSTEM_PROMPT`를 제안했다. 실패 시 안내문을 반환하며, 요약 topic 최대 4개·각 topic별 comment와 근거 ID 배열을 사용한다.

**비교 및 이 레포 계약에 맞지 않는 예시:** 위 응답의 `json_object`, `evidenceIds`, topic별 comment는 기존 strict schema와 formatter에 직접 연결할 수 없다. 순환 모델 선택, 인라인 정책, 작성자 필드 제거, 크기 초과 입력 거부는 합리적인 독립 설계일 수 있지만 현재 레포의 무작위 선택·원격 static·JSONL 작성자 문맥·600개 청크 누적 처리와 다르다. 검증기의 존재 자체를 오답이라 하지 않으며, 이 레포에 그 검증기가 이미 있다고 주장하지 않는다.

올바른 형태 — 기존 레포 계약에 맞춘 예시(LLM 응답 원문 아님):

```ts
const requestOptions = {
  response_format: {
    type: 'json_schema' as const,
    json_schema: SummarizeOutputSchemaOpenai,
  },
};
const output: SummarizationOutput = {
  topics: [{ topic: '배포 조건을 논의함', startMessageId: 'message-id' }],
  comment: '짧은 코멘트',
};
```

실제 수정에서는 `openai.ts`의 기존 sampling·메시지·로그와 함께 이 schema를 사용하고 `convertMessagesToPrompt` 및 `constructSummarizationResult`를 재사용한다. 위 축약 예시는 새 호출 구현이 아니다.

### 요청 B — `ai-image-multimodal`

요청 원문:

> TypeScript에서 OpenAI-compatible chat completions 기반 이미지 생성 기능을 구현하는 예시를 작성하세요. 입력은 사용자 텍스트 프롬프트, 선택적 참조 이미지 URL 배열, 서버/채널/요청 메시지 식별자이며 API 주소/키/모델 목록은 설정에서 받습니다. 텍스트만으로 이미지를 생성할 수도 있고 여러 참조 이미지와 텍스트로 새 이미지를 만들 수도 있어야 합니다. 모델은 이미지와 텍스트를 함께 출력할 수 있습니다. 호출자는 출력 텍스트와, 생성 이미지를 Discord 첨부파일로 보낼 수 있는 Node Buffer 목록을 받아야 합니다. 생성 결과는 URL 또는 base64 data URL일 수 있습니다. 비동기 콜백으로 요청과 응답 또는 실패를 저장할 수 있게 하세요. 필요한 타입과 실제 요청 payload, 결과 변환을 포함해 구현하세요.

실제 응답 발췌:

```ts
export interface GeneratedImageResult {
  text: string;

  /** Discord の files[].attachment に渡せる Buffer 一覧 */
  images: Buffer[];

  /** images と同じ順序 */
  imageMetadata: Array<{
    filename: string;
    mimeType: string;
  }>;

  model: string;
}
```

```ts
const referenceUrls = input.referenceImageUrls ?? [];

for (const url of referenceUrls) {
  requireHttpUrl(url);
}
```

실제 응답 설명 발췌:

> **콜백은 모두 `await`합니다.** 요청/응답 저장 콜백이 실패해도 전체 작업은 실패하도록 설계했습니다. 저장 실패가 생성 결과에 영향을 주면 안 된다면 콜백 내부에서 별도로 처리하세요.

> **텍스트만 반환하는 모델 응답도 허용합니다.** 이미지가 반드시 필요한 서비스라면 반환 후 `result.images.length === 0`을 검사하면 됩니다.

**비교 및 이 레포 계약에 맞지 않는 예시:** HTTP URL만 허용하는 입력 검사는 기존 명령이 만드는 data URL을 거부한다. 텍스트만 있는 응답을 성공 처리하면 현재의 이미지 필수 계약과 다르다. 저장 callback 실패를 생성 실패로 전파하는 설계는 로그 실패 격리와 다르다. 전 공급자 chat completions 호출은 비-OpenRouter Responses 분기를 대체하지 못한다. 첫 모델 고정 선택도 현재 무작위 선택과 다르다.

Buffer와 텍스트 반환은 요청 자체에서 준 추상적인 호출자 목표를 따른 **합당한 다른 레이어 설계**다. 이를 LLM의 일반적 오류로 취급하지 않는다. 실제 레포에서는 utility가 `[model, string[]]`를 반환하고 command가 Buffer/첨부파일로 바꾸며, 공급자 텍스트는 성공 출력에 포함하지 않는다는 차이를 명시한다. 응답의 MIME/크기/URL 검증은 별도 개선 아이디어이지 현재 구현의 보장이나 도입된 코드가 아니다.

올바른 형태 — 현재 레포 경계에 맞춘 예시(LLM 응답 원문 아님):

```ts
const [model, images] = await generateImageFromUser(
  guildId,
  channelId,
  senderId,
  prompt,
  imageInputUrls
);
const files = images.map(image =>
  base64ImageToAttachment(image, { spoiler: true })
);
```

입력 변환은 기존 `imageToBase64`, API 선택은 기존 `generateImage`, Discord 파일 변환은 기존 attachment helper에 맡긴다. 새로운 factory·콜백 종류·결과 객체를 utility에 덧붙이는 것은 caller 전체를 바꾸는 별도 설계 변경이다.

### 요청 C — `reasoning-output-boundary`

앞의 기능 조사와 동일하게 도구·소스·대화 이력이 없는 별도 stateless completion을 실행했다. system은 독립 TypeScript 구현자이며 코드를 실행하거나 적용하지 말라고 지시했다. 실제 요청:

> Implement a TypeScript boundary for an OpenAI-compatible Discord bot that displays only final answer text, never returned reasoning or thinking. Some providers return separate reasoning fields or typed text/thinking content blocks; others insert explicit <think>, <thinking>, or <reasoning> blocks into visible content. Preserve the actual final answer and its references, do not truncate to 2000 characters, and do not disable model reasoning or force a reasoning effort. Show a compact implementation and explain limitations without accessing repository files.

실제 응답의 레포에 그대로 적용하면 안 되는 부분(들여쓰기만 축약):

```ts
for (const content of discordChunks(answer)) {
  await options.channel.send({
    content,
    allowedMentions: { parse: [] },
  });
}
```

이는 독립 봇에서는 합리적인 분할 전송 방식이지만 현재 명령은 defer 후 editReply하며, 이번 요구는 추론 제외와 SDK 호환성이다. 별도 채널 전송·답변 분할은 추가하지 않는다. typed text allowlist와 중첩 태그 필터는 현재 공유 helper 경계와 부합한다. 원문은 비교 자료이며 적용하지 않았다.

## 8. 편집 체크리스트

- [ ] service의 조회·캐시·로그 구성과 utility의 provider 호출 책임을 유지했는가?
- [ ] JSONL의 `EMBEDDING_INPUT`, TEXT fallback, 반응, 시간, 웃음 변환을 보존했는가?
- [ ] schema 필드·required·additionalProperties와 TS 타입·formatter를 함께 살폈는가?
- [ ] 한국어·출력 익명화·질문 재서술·근거 ID 규칙을 입력 비식별화나 민감어 삭제와 혼동하지 않았는가?
- [ ] 로컬 static 파일과 실행 시 fetch하는 main/develop 원격 URL을 구분했는가?
- [ ] 요약 청크 순서·이전 JSON assistant 메시지·한 번의 모델 선택을 유지했는가?
- [ ] 모델 목록은 공통 parser, 공급자/헤더/URL은 기존 shared helper를 사용하는가?
- [ ] OpenRouter 조건과 Google 전용 payload 위치, 텍스트 trace와 이미지 trace 부재를 정확히 설명했는가?
- [ ] 로그 callback의 인자와 실패 격리를 보존하고, OpenRouter 이미지 성공 로그 누락을 보장처럼 서술하지 않았는가?
- [ ] 이미지 입력의 data URL, 비-OpenRouter Responses, 이미지 필수, raw base64/data URL 출력 차이를 보존했는가?
- [ ] Buffer/AttachmentBuilder 변환은 Discord adapter에 남겼고 MIME와 확장자 한계를 인식했는가?
- [ ] 현재 한계를 권장 관례로 바꾸거나 독립 LLM 제안을 구현된 기능처럼 기록하지 않았는가?
