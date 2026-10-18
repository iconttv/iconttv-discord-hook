# 아카이브·전처리·영속성 코딩 컨벤션

[컨벤션 인덱스](README.md) · [AI·프롬프트](ai-and-prompts.md) · [Discord·명령](discord-and-commands.md)

이 문서는 **현재 코드에서 관찰한 계약**, **설정·외부 시스템 요구**, **알려진 제약**, **변경 시 권장 방향**을 구분한다. 현 구현을 재설계한 사양이나 운영 DB 상태의 검증 결과가 아니다. 독립 LLM 예시는 비교 자료이며 실제 소스에 적용하지 않았다.

## 1. 요구사항과 책임 경계

- Discord 메시지 원문·작성자·채널·시각·첨부 메타데이터를 저장하고 수정·삭제·반응을 같은 메시지에 연결한다.
- 라이브 수집과 과거 수집이 같은 식별 체계를 공유하며, 과거 이력은 페이지 단위로 순회한다.
- 이미지/텍스트 첨부와 embed를 검색용 텍스트 및 벡터로 변환한다. 일부 외부 처리 실패가 원문 저장 전체 실패로 확장되지 않게 한다.
- MongoDB는 원본/파생 필드 저장소, SQLite는 실패 URL 캐시, Elasticsearch는 별도의 검색 데이터 계약, Kafka는 선택적 라이브 전송 경로다.

근거 진입점: [`registerEventsArchive`](../../src/controller/archive/index.ts), [`saveMessage`·`savePreviousMessagesAfterJoin`](../../src/service/archive/message.ts), [`processMessage`·`calculateEmbedding`](../../src/service/embedding/discord_processor.ts), [`messageSchema`](../../src/database/model/MessageModel.ts).

| 경계 | 관찰된 책임 |
| --- | --- |
| controller/archive | 이벤트 등록, 반응/voice 오류 보고, 일부 장기 작업 추적 |
| service/archive | 메시지 DTO 구성, Mongo 쓰기, 반응 정규화, 화면 공유/카메라 세션 |
| service/embedding | 텍스트 추출과 임베딩 결과 반환; 메시지 Mongo 쓰기 자체는 하지 않음 |
| database/model | 실제 스키마·타입·인덱스 선언 |
| elasticService / kafkaService | 각각 검색 조회와 선택적 전송; Mongo 저장 성공과 원자적으로 묶이지 않음 |

## 2. 메시지 identity와 DTO → schema

### 관찰된 계약

[`getMessageIdentityFilter`](../../src/utils/discord/index.ts)는 `guildId`, `channelId`, `messageId`가 모두 있을 때만 세 문자열의 객체를 반환하고 하나라도 없으면 `null`을 반환한다. `getMessageIdentityFilterFromMessage`는 Discord의 `id`를 `messageId`로 옮긴다. 수정·삭제·반응·CLI 임베딩 갱신에서 이 helper를 재사용한다. 메시지 ID만으로 조회하도록 축소하지 않는다.

[`messageSchema`](../../src/database/model/MessageModel.ts)의 unique index는 `{ guildId: 1, channelId: 1, messageId: 1 }`이다. `mongoose.model('Message', messageSchema, 'discordMessages')`처럼 collection도 명시한다. 이것은 **소스상의 인덱스 선언**이지 운영 DB에 해당 인덱스가 실제 생성되어 있다는 증명은 아니다.

| 필드 | 실제 저장 형식/의미 |
| --- | --- |
| `guildId`, `channelId`, `messageId`, `senderId` | required String. `Message` 객체 자체를 저장 계약으로 넘기지 않고 log context에서 DTO 구성 |
| `messageType`, `message` | Number, String. context의 `senderMessage`를 저장 시 `message`로 매핑 |
| `attachments`, `components`, `embeds` | `Mixed[]`; 파일 바이너리 백업을 의미하지 않음 |
| `guildName`, `channelName`, `senderName` | String 스냅샷 |
| `raw` | schema는 Mixed, 메시지 저장 경로에서는 `JSON.stringify(message)` 문자열 |
| `createdAt`, `editedAt`, `deletedAt` | Date, 기본 `null`. Discord 시각과 삭제 처리 시각을 구분 |
| `isDeleted` | Boolean 기본 `false`; 원문을 지우는 대신 tombstone |
| `reactions` | 아래의 구조화된 entry 배열, 기본 `[]` |
| `TEXT_MESSAGE` | String |
| `TEXT_ATTACHMENTS`, `TEXT_COMPONENTS`, `TEXT_EMBEDS` | `Map<string, string>`, 기본 `null`; artifact ID별 검색용 텍스트 |
| `EMBEDDING_MODEL`, `EMBEDDING_INPUT` | String, 기본 `null` |
| `EMBEDDING_DIM`, `EMBEDDING` | Number / Number 배열, 기본 `null` |
| `EMBEDDING_STATUS` | Boolean, 기본 `null`; 전처리 반환 객체의 `undefined`와 DB 기본값을 혼동하지 않음 |
| `_CREATED_AT` | Date 기본 `Date.now`; Discord `createdAt`과 다른 적재 시각 |

필드 이름은 인터페이스만 보고 추측하지 말고 스키마와 writer를 함께 확인한다. 특히 대문자 `TEXT_*`/`EMBEDDING_*`는 Mongo 저장 계약이고 Elasticsearch의 소문자 필드와 동일 이름이 아니다.

## 3. 라이브와 백필은 같은 동작이 아니다

근거: [`message.ts`](../../src/service/archive/message.ts)의 `saveMessage`, `saveMessagesBulk`, `savePreviousMessages`, `savePreviousMessagesAfterJoin`.

| 항목 | 라이브 `saveMessage` | 백필 `saveMessagesBulk` |
| --- | --- | --- |
| 입력 허용 | context와 `guildMember`, `channelId` 필요 | context와 `channelId` 필요; 같은 member guard는 없음 |
| Mongo 쓰기 | `new MessageModel`, `isNew = true`, `save({ w: 0, wtimeout: 1000 })` | 복합 identity의 `updateOne`, `$set: doc`, `upsert: true`, `ordered: false` |
| 중복 처리 | insert 경로; unique index에 의존, upsert 아님 | 같은 identity에 반복 기록하는 upsert |
| 임베딩 | 저장 전에 실행. 반환 필드를 명시적으로 복사, 예외는 로그 후 원문 저장 | 5개씩 처리, `Promise.allSettled`; 전처리 `null`/예외는 status `null` |
| Kafka | 임베딩보다 먼저 promise를 시작하고 Mongo save 뒤 await | 호출하지 않음 |
| 시간 | `_CREATED_AT` schema 기본값 | DTO에 `_CREATED_AT: new Date()` 명시 |

**제약:** 라이브 저장의 `w: 0`는 acknowledged durability나 중복 오류 감지를 보장하지 않는다. 백필 upsert도 버전 비교나 `$setOnInsert`가 아니라 `$set`이므로 중복 레코드 방지와 최신 내용 보존을 같은 보장으로 설명하면 안 된다. 백필 적재 시각/파생 필드를 다시 쓸 수 있다. 임베딩 호출이 저장 전에 있으므로, 실패를 잡더라도 느린 호출이 원문 저장을 지연시킬 수 있다. 이 성질을 새 기능에 무조건 복제하라는 컨벤션은 아니다.

### 페이지 순회와 범위

- `getArchivableTextChannels`: `guild.channels.fetch()` 후 self member가 있어야 하며, text-based이고 `messages`가 존재하고 `viewable`, `ViewChannel`, `ReadMessageHistory` 조건을 모두 만족해야 한다. self member가 없으면 빈 결과다. 별도의 archived-thread 열거는 하지 않는다.
- `savePreviousMessages`: 기본 `limit = 100`, `cache = false`, 선택적 `before`. fetch는 `es-toolkit.retry`의 `retries: 5`, `delay: attempts => 2 ** attempts`를 사용한다. 임의로 초 단위 지연이라고 설명하지 않는다.
- `stopAfterMessageId`가 있으면 저장할 메시지를 `BigInt(id) > BigInt(boundary)`로 걸러낸다. 다음 `before`는 **필터 전 전체 페이지**에서 가장 오래된 ID다. 빈 페이지, 커서 정체, 경계 도달, 종료 요청이 중단 조건이다. Snowflake 숫자를 `Number`로 바꾸지 않는다.
- `savePreviousMessagesAfterJoin`: 함수 시작 시각의 Snowflake를 상한으로 고정한다. 채널별 Mongo의 newest/oldest ID를 읽고, newest보다 새 누락분을 먼저 채운 뒤 oldest 이전의 과거를 수집한다. 기록이 없으면 상한 이전 전체를 수집한다. 채널은 순차 처리한다.
- CLI `backfill`은 [`src/cli.ts`](../../src/cli.ts)의 별도 날짜 상한으로 각 채널을 순회한다. join 보충 경로와 같은 newest 경계 알고리즘이라고 설명하지 않는다.

## 4. 수정·삭제·반응·voice 저장 규칙

### 메시지 수정/삭제

[`updateMessage`](../../src/service/archive/message.ts)는 새 context와 복합 filter를 사용하고, 본문·artifact·표시 이름·raw·생성/편집 시각을 `findOneAndUpdate(..., { upsert: true, new: true })`로 갱신한다. **현재 재임베딩이나 Kafka 재전송은 없다.** 따라서 수정 후 `TEXT_*`/벡터가 오래된 상태로 남을 수 있다. 이를 검색 일관성 권장 패턴으로 제시하지 않는다.

`deleteMessage`는 identity만으로 `isDeleted: true`, `deletedAt: Date.now()`를 쓰며 upsert를 지정하지 않는다. `bulkDeleteMessage`도 각 복합 filter로 같은 tombstone을 쓴다. 원문/raw/embedding을 삭제하지 않으며 없는 문서를 삭제 이벤트로 새로 만들지 않는다.

### 반응

[`onMessageReactionChange`](../../src/service/archive/reaction.ts)는 partial reaction을 fetch하고 복합 filter를 구한다. 저장 형태는 `MessageReactionEntry[]`이며 entry는 `emoji: { animated, name, id, reaction, identifier }`, `senders: { senderId, senderName }[]`, `count`다. entry/sender/emoji sub-schema는 `_id: false`다.

- 식별자는 표시 이름이 아니라 `emoji.identifier`다. `normalizeStoredReactions`는 배열뿐 아니라 과거 Map/일반 객체도 읽고 새 배열로 정규화한다.
- add/remove 시 reaction user 목록을 fetch하고 count는 `reaction.count ?? senders.length`를 쓴다. 목록이 비었고 fallback user가 있으면 sender를 보충한다.
- count가 0 이하이면 entry 제거, 그 외 같은 identifier를 교체/추가한다. `removeEmoji`는 해당 entry만, `removeAll`은 전체 배열을 비운다.
- 모든 반응 쓰기는 `upsert: false`다. 반응만으로 메시지 원문 문서를 만들지 않는다.

**제약:** 읽기 → 배열 병합 → 쓰기 구조로 동시 반응 업데이트의 직렬화나 원자적 병합까지 보장하지 않는다. user fetch를 전체 역사 반응의 완전한 복원 보장으로 확장해 설명하지 않는다.

### 화면 공유와 카메라

[`onArchiveVoiceStateUpdate`·`reconcileGuildStreamingStates`](../../src/service/archive/voiceState.ts), [`voiceStateSchema`](../../src/database/model/VoiceStateModel.ts)가 근거다. 일반 음성 접속 시간 전체가 아니라 `streamType: 'streaming' | 'selfVideo'` 두 종류를 독립적으로 처리한다.

- 세션 키는 guild/channel/member/streamType. 시작 시 같은 활성 세션을 조회하고 없으면 생성한다. 중지 시 해당 키의 활성 문서를 모두 닫는다.
- 활성 상태로 채널을 이동하면 이전 채널 종료 후 새 채널 시작이다. 종료는 `streamingEndAt`, `isStreaming: false`, `updatedAt`, 경과 **초**를 기록하며 `max(0, floor(ms / 1000))`를 사용한다.
- 시작 기록이 없는데 종료 이벤트가 오면 시작=종료=`now`, elapsed=0인 완료 세션을 만든다.
- ready/join의 reconciliation은 Discord voice cache의 현재 상태와 비교해 stale Mongo 세션을 닫고 누락 활성 세션을 연다. 실제 오프라인 종료 시각을 복원하는 것은 아니다.
- 필수 필드는 guild/channel/member/streamType/isStreaming이고 이름·시각·elapsed는 부가 필드다. collection은 `voiceStates`. 두 복합 인덱스는 `(guildId, channelId, memberId, streamType, isStreaming)`와 `(guildId, streamType, isStreaming, memberId, channelId)`이며 **unique가 아니다**. 조회 후 create를 경쟁 안전한 unique 보장이라고 하지 않는다.

## 5. 멀티모달 전처리와 상태

근거: [`discord_processor.ts`](../../src/service/embedding/discord_processor.ts), [`FailureUrlStore`](../../src/service/embedding/failure_urls.ts).

### 관찰된 추출 규칙

1. `processMessage`는 guild/channel/message ID가 없으면 `null`을 반환한다. 정상 ID의 내용 없는 입력은 보통 빈 update 객체를 반환한다.
2. 본문은 `replaceDiscordEmoji`로 정규화한다. 첨부는 contentType `image/`면 image caption, `text/`면 텍스트 다운로드만 지원한다. 확장자 추측, 영상/오디오 변환은 없다. name/title/description/content type도 텍스트에 포함한다.
3. 첨부 결과는 ID별 Map이며 `## IMAGE`/`## TEXT`와 세부 `### ...` 헤더를 쓴다. 첨부는 메시지 내에서 순차 처리한다.
4. component 처리는 로그 후 `null`이다. `TEXT_COMPONENTS` 저장 슬롯이 있다는 이유로 실제 component 추출을 지원한다고 쓰지 않는다.
5. embed는 `embed.data`의 provider/title/author/description과 thumbnail 이미지 설명을 사용한다. 일반 URL 본문 추출은 token 비용 때문에 비활성 주석 상태다. embed의 모든 field/footer/image를 순회하는 구현이 아니다. ID가 없으면 시각 문자열을 쓴다.
6. `calculateEmbedding`은 `# TEXT`, `# ATTACHMENT`, `# COMPONENT`, `# EMBED` 블록을 **본문 → 첨부 → component → embed** 순서로 넣고 `\n\n\n`으로 결합한다. 아무 블록도 없으면 `null`. 성공하면 model은 `config.EMBEDDING_OPENAI_MODEL`, dimension은 실제 vector 길이다.

### 상태를 truthy/falsy로 뭉개지 않는다

| 위치/값 | 실제 의미 |
| --- | --- |
| 반환 객체 `EMBEDDING_STATUS === undefined` | 보통 처리할 텍스트가 없어 임베딩 시도 자체가 없거나 결과를 설정하지 않음. 모든 미처리 사유를 단정할 수 없음 |
| 반환 객체 `false` | `calculateEmbedding`이 `null`을 주거나 임베딩 단계 예외가 발생함. 성공한 `TEXT_*`는 남을 수 있음 |
| 반환 객체 `true` | embedding 호출이 반환되어 벡터·모델·차원을 설정함. 모든 첨부 성공을 의미하지 않음 |
| 반환값 `null` | 필수 identity 누락. 백필 caller는 status `null`로 저장하며 live caller는 기본값 경로 |
| Mongo `null`/필드 없음 | schema 기본값 및 과거 문서 상태. JS `undefined`와 저장상의 동일 값을 가정하지 않음 |

전처리기는 Mongo에 저장하지 않고 부분 결과를 반환한다. 첨부/thumbnail 실패는 로그와 실패 URL 기록 후 다른 텍스트로 계속할 수 있다. `calculateEmbedding` 예외는 `processMessage`에서 false로 낮추지만, 실패 시 `EMBEDDING_INPUT`이 항상 반환되는 것은 아니다.

[`src/cli.ts`](../../src/cli.ts)의 `embedding`은 기본적으로 `EMBEDDING_STATUS: { $eq: null }`과 미삭제 조건을 사용하며 `false`를 기본 재시도 대상으로 포함하지 않는다. `--all`은 status 조건을 제거하고 `--migrate`는 모델 불일치를 추가한다. 기존 `EMBEDDING_INPUT`이 있으면 그것을 다시 임베딩하고, 없으면 저장된 `TEXT_*`/본문으로 계산한다. 첨부 URL 전체 재전처리 기능은 아니다. cursor의 `eachAsync` 병렬도는 10이지만 호출 자체를 await하지 않는 현재 제어 흐름은 완료 보장 패턴으로 권장하지 않는다.

### SQLite 실패 URL 캐시

`FailureUrlStore` singleton 생성은 import 시 `./database` 디렉터리 생성과 `./database/failure_urls.db` 열기를 수행한다. WAL, `failure_urls(url TEXT PRIMARY KEY, createdAt TEXT ...)`, prepared SELECT 및 `INSERT OR IGNORE`를 쓴다. 첨부/thumbnail URL이 캐시에 있으면 호출을 생략한다. TTL, 자동 재시도, 실패 원인 저장, 만료 삭제는 없다. `close()`는 멱등이고 닫힌 뒤 get/insert는 throw한다.

**주의:** 네트워크 일시 장애도 사실상 영구 skip될 수 있으며 unsupported contentType skip 자체는 캐시 실패로 기록하지 않는다. 조사·문서화 때문에 이 모듈을 실행/import하거나 운영 DB를 열지 않는다. 캐시 정책 변경은 별도 설계이고 현재 구현에 TTL이 있다고 문서화하면 안 된다.

## 6. 동시성·종료·외부 저장 경계

### 관찰된 종료 추적

[`lifecycle.ts`](../../src/service/archive/lifecycle.ts)의 Set에는 `trackArchiveWork`로 넘긴 promise만 등록되며 finally에서 제거된다. `waitForTrackedArchiveWork`는 호출 당시 Set 스냅샷의 `Promise.allSettled`를 기다린다. backfill은 페이지/채널 경계에서 종료 플래그를 확인한다. 진행 중 네트워크 fetch를 AbortSignal로 즉시 취소하지 않는다.

[`registerEventsArchive`](../../src/controller/archive/index.ts)에서 ready의 voice reconciliation과 GuildCreate의 reconciliation/backfill은 추적하지만 일반 메시지/반응/voice 이벤트는 추적하지 않는다. [`src/archive.ts`](../../src/archive.ts)는 요청 플래그 → 추적 작업 대기 → Discord destroy → Mongo disconnect → Kafka producer disconnect 순서이며 SQLite close 호출은 없다. 따라서 “종료가 모든 쓰기를 drain한다”는 주장은 잘못이다. CLI backfill은 전체 채널 루프를 추적한다.

### 설정·외부 시스템 요구

- [`createMongooseConnection`](../../src/database/index.ts)은 config로 URI를 구성하고 `maxPoolSize: 10`으로 `mongoose.connect`를 **호출하지만 반환/await하지 않는다**. caller의 `await createMongooseConnection()`은 연결 완료 대기가 아니다. 비밀값/완성 URI를 로그나 예시에 넣지 않는다. 향후 연결 완료 계약을 고친다면 bootstrap caller도 함께 검토해야 한다.
- [`produceMessageToKafka`](../../src/service/kafkaService.ts)는 공백 본문을 보내지 않는다. 새 client 생성은 `KAFKA_ENABLE`과 `KAFKA_REST_PROXY`가 있어야 가능하고 producer/client는 캐시된다. REST proxy로 broker를 찾고 topic 기본값은 `iconttv-message`, key는 `guildId_channelId`; 메시지/작성자/thread ID와 시각을 headers/timestamp로 보낸다. 예외는 내부에서 로그한다. backfill/update/delete/반응/voice 전체를 동기화하는 이벤트 버스가 아니다.
- [`searchMessage`·`searchMessageEmbedding`](../../src/service/elasticService.ts)은 `ELASTIC_HOST`, `ELASTIC_API` 미설정 시 throw하며 `iconttv-discord-message_*`를 조회한다. guild 필터와 선택적 channel 필터, 필요한 필드 존재 조건을 유지한다. 키워드 검색은 `embeddingInput`, 벡터 검색은 `embedding`과 instruct를 붙인 query embedding을 사용한다.
- **외부 인덱싱 경계:** 위 archive 쓰기 경로는 Mongo의 `EMBEDDING_INPUT`을 Elastic의 `embeddingInput`으로 직접 색인하지 않는다. 검색 index/mapping·필드 변환·삭제 전파·동기화 지연은 이 writer의 보장이 아니다. Mongo 저장만으로 검색 반영/삭제 제외가 보장된다고 쓰지 않는다. 운영 index 생성/설정은 소스의 Mongoose index 선언과도 별개다.

### 다른 모델을 편집할 때

근거는 [`src/database/model/`](../../src/database/model/AGENTS.md)의 실제 schema 파일이다. `AiRequestSchema`는 guild/channel required, provider/model/params/response, 생성 시각과 비unique guild/channel index를 가진다. `DiscordSetting`은 guild unique와 resize/question 플래그 기본 false 및 추가 superuser ID 배열을 가진다. `GuildPermission`의 unique는 guild이며 `level` 주석 계약은 0/3/10이다(채널별 unique가 아님). `GuildUserName`은 guild/user unique와 일반/익명 이름을 저장한다. `MessageSummarization`은 guild/channel·hours/count·요약·생성 시각을 가지며 별도 index 선언은 없다. 다른 모델의 기본값/index를 메시지 모델에서 유추하지 않는다.

## 7. 독립 LLM 요청과 실제 불일치

### 요청 방식

코드를 조사한 뒤 별도의 stateless `completion(prompt, system=...)` 두 요청을 실행했다. 별도 모델은 도구·파일 접근·대화 이력이 없고 실제 코드/내부 이름/원하는 오답을 주지 않았다. 아래는 **실제 요청 문자열 전체**와 **실제 응답의 일부 원문**이다. 응답 전체는 검토용 local artifact에만 보관하며 런타임 코드에 적용하지 않았다. 대안 설계는 일반적 오답이 아니라 **이 레포 계약에 맞지 않는 예시**로 분류한다.

공통 system:

```text
당신은 레포 파일, 실제 소스, 관례를 전혀 모르는 독립 구현자다. 주어진 기능 요구만으로 TypeScript 예시를 작성하라. 도구나 파일 접근 없이 답하고 코드는 실행하거나 적용하지 않는다. 구현 핵심을 100줄 이내로 제시하라.
```

### A. 이벤트·백필·중복 방지 (`archive-event-backfill`)

```text
TypeScript strict, Discord.js, Mongoose를 사용하는 Discord 서버 메시지 아카이버를 예시로 구현하라. 공개 입력은 Discord 메시지 생성·수정·삭제·반응 이벤트와 서버/채널의 과거 메시지 조회 API다. 메시지 본문과 첨부·embed 및 작성자/서버/채널 정보와 생성·수정·삭제 시각을 보존한다. 삭제 이벤트는 원문을 남긴다. 이벤트 수신과 과거 이력 수집이 겹치거나 재시작되어도 같은 메시지 레코드가 중복되지 않게 한다. 이미 일부 저장된 채널에서 신규 누락분과 더 오래된 과거를 수집하고, API 페이지 제한과 일시 실패 및 종료 요청을 고려한다. 임베딩과 선택적인 외부 이벤트 전송이 실패해도 원문 저장을 잃지 않는다. 저장 모델, 라이브 이벤트 처리, 백필 함수의 핵심 구현을 보여라.
```

실제 응답 발췌(변수명·주석 그대로):

```ts
interface Row {
  _id: string; guildId: string; channelId: string; body?: unknown; version?: number;
  createdAt?: Date; deletedAt?: Date; reactions: string[]; seq: number;
  pending: boolean; leaseUntil?: Date; owner?: string;
}
```

```ts
    await Archive.updateOne({ _id: m.id }, [{ $set: { ...base, ...patch,
      seq: { $add: [{ $ifNull: ["$seq", 0] }, 1] }, pending: true } }], { upsert: true });
```

```ts
      const key = `${r.emoji.id ?? r.emoji.name}:${u.id}`;
```

실제 응답은 별도 checkpoint 모델, lease, version, outbox에 해당하는 pending worker를 제안했다. 합리적인 별도 설계지만 현재 레포에 이 모델/worker는 없다.

| 실제 응답과의 차이 | 이 레포에 그대로 넣으면 안 되는 이유 | 맞춰야 할 현재 근거 |
| --- | --- | --- |
| `_id: m.id`로 identity 대체 | 기존 compound filter/index와 문서 형태 단절 | `getMessageIdentityFilter`, `messageSchema.index` |
| `reactions: string[]`, emoji/user 합성 key | 구조화 emoji/sender/count 및 legacy 정규화 손실 | `MessageReactionEntry`, `onMessageReactionChange` |
| Progress checkpoint/lease·pending worker | 현행 저장 collection/종료 경로에 존재하지 않는 재설계 | 현재 backfill은 채널 DB bounds와 before 순회 |
| 모든 이벤트 upsert | 삭제/반응은 없는 메시지를 생성하지 않는 현행 정책과 다름 | `deleteMessage`, 반응 `{ upsert: false }` |

레포에 맞춘 올바른 형태(실제 응답이 아닌 별도 축약 예시):

```ts
const filter = getMessageIdentityFilterFromMessage(message);
if (!filter) return;
await MessageModel.findOneAndUpdate(filter, {
  isDeleted: true,
  deletedAt: Date.now(),
});
```

이는 기존 `deleteMessage`의 원문 보존/identity 계약을 보여준다. live insert를 upsert로 바꾸거나 버전 보호/outbox를 도입하는 작업은 이 문서의 단순 스타일 수정 범위가 아니다.

### B. 멀티모달 임베딩·실패 저장 (`archive-multimodal-embedding`)

```text
TypeScript strict, Discord.js 메시지 데이터, Mongoose 저장소를 사용하는 멀티모달 검색용 전처리기를 예시로 구현하라. 입력은 서버/채널/메시지 식별자, 본문, 첨부파일과 embed다. 이미지 설명 API, 텍스트 파일 다운로드, 벡터 임베딩 API를 사용할 수 있다. 본문과 이미지/텍스트 첨부 및 embed 정보를 검색용 텍스트로 만들고 벡터·모델명·차원·원본과 처리 상태를 저장한다. 한 첨부 처리나 임베딩 API가 실패해도 원문 및 성공한 전처리 결과는 보존한다. 실패한 URL은 SQLite에 보관하여 반복 접근을 피한다. 처리할 내용이 없는 경우와 임베딩 실패 및 성공을 구분한다. 처리 함수와 상태 저장 및 실패 캐시의 핵심 예시를 작성하라.
```

실제 응답 발췌:

```ts
type Status = "processing" | "empty" | "embedding_failed" | "success";
```

```ts
  const persist = () => save({ text: parts.join("\n\n"), failures: [...failures] });
```

```ts
    else if (a.contentType?.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(a.name))
      await consume(a.url, "text");
```

```ts
    this.db.prepare(`INSERT OR REPLACE INTO failed_urls
      (url, reason, failed_at) VALUES (?, ?, ?)`)
      .run(url, reason, new Date().toISOString());
```

| 실제 응답과의 차이 | 이 레포 계약에 맞지 않는 점 | 올바른 현재 형태 |
| --- | --- | --- |
| String status enum | Boolean/null schema와 CLI null 조회를 깨뜨림 | 반환 `undefined`/`false`/`true`와 DB null 구분 |
| `text`에 모두 평탄화 | artifact별 Map 및 헤더/결합 순서가 사라짐 | `TEXT_*` Map과 `calculateEmbedding` 사용 |
| 전처리 함수 내부에서 Mongo 중간 저장 | 현재 pure-result 경계와 writer 소유권 변경 | 결과 반환 후 archive writer가 명시적 필드 복사 |
| 확장자로 text 추론·추가 embed 이미지/field 처리 | 현 contentType/thumbnail 중심 범위를 임의 확장 | `processAttachment`, `processEmbed`의 실제 지원 범위 유지 |
| `failed_urls` + reason/replace | 실제 SQLite table/column/insert 정책과 불일치 | `failure_urls`, prepared `INSERT OR IGNORE` |

레포에 맞춘 올바른 형태(실제 응답이 아닌 별도 축약 예시, `calculateEmbedding` 계약):

```ts
const embedding = await aiClient.createEmbeddingText(combinedText);
embeddingResult.EMBEDDING_STATUS = true;
embeddingResult.EMBEDDING = embedding;
embeddingResult.EMBEDDING_MODEL = config.EMBEDDING_OPENAI_MODEL;
embeddingResult.EMBEDDING_DIM = embedding.length;
```

명시적 status enum, 원문 우선 저장, durable worker 자체가 나쁜 설계라는 뜻은 아니다. 도입하려면 스키마·writer·CLI·검색 소비자·운영 데이터 마이그레이션을 함께 바꾸는 별도 요구사항이 필요하다.

## 8. 편집 체크리스트

- [ ] 코드 근거 symbol과 DTO/schema/소비자 필드가 일치하는가? Mongo 대문자 필드와 Elastic 소문자 필드를 구분했는가?
- [ ] 모든 갱신 filter가 guild/channel/message identity를 보존하고, 필수 ID 누락 시 중단하는가?
- [ ] 라이브 insert와 백필 upsert의 현재 차이를 명시하고 durability/최신 버전 보호를 과장하지 않았는가?
- [ ] 삭제는 원문 보존, 반응은 emoji identifier와 sender/count 구조, voice는 streamType별 세션인가?
- [ ] 부분 실패·빈 입력·임베딩 실패/성공·DB null을 구분하고 CLI 재처리 대상까지 확인했는가?
- [ ] 첨부/component/embed 지원 범위를 실제보다 넓게 쓰지 않았는가? 실패 URL 캐시가 import 부작용/영구 skip을 갖는가?
- [ ] 종료 추적 대상, batch 5/CLI concurrency 10/Mongo pool 10의 서로 다른 의미를 구분했는가?
- [ ] 수정 재임베딩 없음, Mongo connect 반환 없음, 일부 작업만 drain, 외부 Elastic 색인 경계를 제약으로 표기했는가?
- [ ] 스키마 index 선언을 운영 DB 상태의 증명으로 오인하지 않고 비밀값/URI/실제 운영 payload를 문서에 남기지 않았는가?
- [ ] 독립 응답 원문과 레포 적합 예시를 구별하고, 문서 작업 때문에 서비스·네트워크·운영 DB를 실행하지 않았는가?
