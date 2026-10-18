# Discord 라우팅·명령·메시지 재게시 컨벤션

## 적용 범위와 읽는 방법

이 문서는 현재 Discord 이벤트 경로, 배포 가능한 슬래시 명령 9개, 설정·권한, 공통 문맥/식별자, 아이콘·이미지 임베드 계약을 설명한다. **관찰된 계약**은 지금 호출자가 의존하는 동작, **주의사항**은 현 구현의 위험, **권장 방향**은 수정 시 지켜야 할 방향이다. 위험을 기존 스타일이라는 이유로 복제하지 않는다. 독립 LLM 예시는 검토 자료일 뿐 런타임에 적용하지 않았다.

- 공통 기준과 다른 영역: [컨벤션 인덱스](README.md), [코어·어댑터](core-and-adapters.md), [보관·영속성](archive-and-persistence.md), [AI·프롬프트](ai-and-prompts.md).
- 핵심 소스: [컨트롤러](../../src/controller/index.ts) `registerEvents`, [명령 로더](../../src/service/commands/index.ts) `readCommands`, [Discord helper](../../src/utils/discord/index.ts).

## 1. 기능과 경계

### 관찰된 계약

1. [메인 이벤트 등록](../../src/controller/index.ts) `registerEvents`는 준비/로그 이벤트, 메시지 생성·수정, 슬래시 명령과 모달 제출을 연결한다. 메시지 수정도 `onMessageCreate(newMessage)`로 진입한다.
2. [명령 디스패처](../../src/controller/onCommandInteractionCreate.ts) `onCommandInteractionCreate`는 `readCommands()[1]`에서 `interaction.commandName`을 조회한다. 없으면 응답 없이 반환한다.
3. [메시지 진입점](../../src/controller/onMessageCreate.ts) `onMessageCreate`는 서버 설정 조회 후 `replaceIcon`을 호출하고, `enableFeatureIconImageResize`가 참일 때만 `replaceImageToEmbed`도 호출한다.
4. [보관 이벤트 등록](../../src/controller/archive/index.ts) `registerEventsArchive`는 별도 경계다. 메시지 생성/수정/삭제/일괄 삭제, 반응, 음성 상태와 가입 시 이전 메시지 수집을 보관 서비스로 넘긴다. 메인 메시지 변환을 이 경로에 중복 설치하지 않는다.
5. 컨트롤러는 라우팅·가드·서비스 호출을 담당한다. 설정 조회/저장은 [settingService](../../src/service/settingService.ts), 변환은 [iconService](../../src/service/iconService.ts)와 [imageToEmbedService](../../src/service/imageToEmbedService.ts), 외부 질의는 해당 서비스에 둔다.

### 주의사항: 비동기 오류 경계

현재 `registerEvents`의 interaction 분기에는 `onCommandInteractionCreate`/`onModalSubmit`의 `await`가 없다. 명령 디스패처도 handler의 체인을 반환/await하지 않으며, `.catch(...).then(...)`으로 실패 뒤 성공 로그가 남을 수 있다. `onMessageCreate` 역시 두 변환 함수를 await하지 않는다. 따라서 상위 `try/catch`가 전체 비동기 작업 실패를 회수한다고 가정하면 안 된다. 새 코드는 부모가 완료와 실패를 관측해야 하는 작업을 `await`/반환하고, 의도적 분리 작업은 독립 오류 처리를 명확히 한다. 현 누락을 권장 예제로 삼지 않는다.

클라이언트는 [lib/discord.ts](../../src/lib/discord.ts)에서 Message/Channel/Reaction/User partial을 허용한다. 그러나 메인 메시지 변환 함수의 인자는 `Message`이고 partial fetch, 봇 메시지 제외, 채널 send 가능 여부 가드가 이 경로에 명시되어 있지 않다. `as TextChannel`은 런타임 검사가 아니다. partial/봇/채널 처리를 지원한다고 문서만으로 단정하지 않는다.

## 2. 명령 모듈과 배포 계약

### 관찰된 계약

[readCommands](../../src/service/commands/index.ts)는 현재 디렉터리의 `.ts`/`.js` 파일을 동적으로 import한다. `index.ts`, `index.js`, 현재 파일, `_` 시작 파일, `.d.ts`는 제외한다.

- 배포 파일은 **named export `data`와 `execute`**가 필요하다. `data`는 builder이며 로더가 `data.toJSON()`과 `data.name`을 사용한다. `execute`는 `ChatInputCommandInteraction` 하나를 받고 `Promise<void>`를 반환하는 핸들러 계약이다.
- 파일 이름은 내부 기능을 설명하는 camelCase도 사용한다(`imageGeneration.ts`). 사용자 명령 이름은 파일명이 아니라 `data.setName(...)`이다. 기존 이름을 임의로 `imagegeneration`, `question` 등으로 바꾸지 않는다.
- 로더 결과는 `[REST JSON 배열, 이름→핸들러 객체]` 튜플이며 두 캐시가 모두 비어 있지 않으면 재사용한다. 재로딩/정렬/중복 이름 검증을 제공하는 시스템이 아니다. 명령 이름을 고유하게 유지하고 import 순서에 의존하지 않는다.
- `data`/`execute`가 없으면 경고를 남기고 제외한다. 객체 하나나 default export만 제공하면 이 로더와 맞지 않는다. import 시 실행 부작용도 피한다.
- [deploy-commands.ts](../../src/deploy-commands.ts) `registerCommands`도 같은 로더의 JSON 배열을 사용한다. `purgeAndRegisterCommands`는 전역 애플리케이션 명령을 지운 뒤 등록하며 파일 최상위에서 호출된다. **조사/검증 목적으로 import하거나 실행하지 않는다.** 로컬 라우터에만 이름을 추가해도 Discord 등록이 갱신되는 것은 아니다.
- [_list.ts](../../src/service/commands/_list.ts)의 `itvlist`는 `_` 필터로 배포 대상이 아니다. 현재 배포 가능한 명령은 아래 9개다.

### 현재 명령 목록과 실제 옵션

| 사용자 명령 | 소스와 symbol | 입력·출력 및 정책 |
|---|---|---|
| `/itvhelp` | [help.ts](../../src/service/commands/help.ts) `data`, `execute` | 즉시 `reply`: `~` 사용법과 소스 링크 |
| `/itvchangelog` | [changelog.ts](../../src/service/commands/changelog.ts) `execute` | 설정된 GitHub 기본 URL의 최근 변경 문서를 fetch 후 `reply`; fetch 예외는 로깅 후 대체 문구 |
| `/whoami` | [whoami.ts](../../src/service/commands/whoami.ts) `execute` | `getLogContext`로 서버/채널/발신자 이름과 ID 표시; 15초 뒤 삭제 예약 |
| `/itvsetting` | [setting.ts](../../src/service/commands/setting.ts) `data`, `execute` | Guild context, 기본 `ModerateMembers`, 실행 시 같은 권한 확인, 설정 모달 표시 |
| `/itvques` | [question.ts](../../src/service/commands/question.ts) `execute` | 필수 `q`, 선택 number `count` 100~1000/기본 500; 회원 정책+서버 AI 허용 검사; 현재 서버·현재 채널의 최근 대화 질의 결과를 `editReply` |
| `/itvsumm` | [summarize.ts](../../src/service/commands/summarize.ts) `execute` | 선택 number `hours` 1~12 또는 `count` 25~3000; 둘 다 없으면 count 300; 서버 AI 허용 검사, 결과+소요 시간 |
| `/itvsc` | [search.ts](../../src/service/commands/search.ts) `execute` | 필수 `keyword`, 선택 boolean `channel`/`embedding`/`keep`; 기본 모두 false; 서버 범위 또는 현재 채널 검색, 텍스트/벡터 중 선택, 결과별 30자 요약·링크·시각; keep이 거짓이면 3분 뒤 삭제 |
| `/itvstat` | [statistics.ts](../../src/service/commands/statistics.ts) `execute` | 선택 boolean `channel` 기본 false, `keep` 기본 true; 자신/전체 메시지 수와 점유율 embed; keep이 거짓이면 3분 뒤 삭제 |
| `/itvimgen` | [imageGeneration.ts](../../src/service/commands/imageGeneration.ts) `execute` | 필수 `p`, 선택 첨부 `iedit`, `iref1`~`iref3`; 서버 확인 후 defer, 이미지를 순서대로 base64 변환, 생성 결과를 작성자 embed+spoiler 첨부로 전송 |

**설명과 실행의 차이:** `/itvstat`의 `keep` 설명은 실행의 `if (!keepMessage)` 및 기본 true와 일치하지 않는 부분이 있다. 기본 삭제 여부를 `/itvsc`와 통일되어 있다고 가정하지 말고 실제 코드를 따른다. `/itvsc`의 벡터 검색 실패는 자동 텍스트 검색 재시도를 의미하지 않는다.

## 3. 설정·권한·서버 문맥

### 관찰된 계약

- [settingService.ts](../../src/service/settingService.ts) `getGuildSetting`은 trigger의 `guildId`로 첫 설정을 조회하고 없으면 `null`을 반환한다. `setGuildSetting`은 같은 서버 키로 두 boolean과 `updatedBy`를 `$set`, `upsert`한다.
- [DiscordSettingModel](../../src/database/model/DiscordSettingModel.ts)은 `guildId` 고유 인덱스, 이미지 변환/질문 전체 허용 기본 false, `additionalSuperuserIds` 기본 빈 배열을 정의한다. 모달은 추가 허용 사용자 목록 편집 UI가 아니다.
- `/itvsetting`은 `ModerateMembers`를 등록과 실행 양쪽에서 확인한다. `showModal` 자체가 최초 interaction 응답이므로 앞에 `deferReply`를 추가하는 패턴으로 바꾸지 않는다.
- 모달 ID는 `setting`; 필드 ID는 `enableFeatureIconImageResize`, `enableCommandQuestionForEveryone`이다. [onModalSubmit](../../src/controller/onModalSubmit.ts)은 비어 있으면 `undefined`, 값이 있으면 정확히 `'1'`일 때만 true로 파싱하고 저장한다. 저장 알림은 일반 reply 후 5초 뒤 삭제한다.
- `/itvques`의 사용자 권한은 **ModerateMembers 또는 전체 허용 설정 또는 additionalSuperuserIds 포함**이다. 그 다음 서버 존재와 [rejectGPTRequestAndGetMessage](../../src/utils/auth.ts)의 서버별 AI 권한을 확인한다. 이 helper는 문서가 없거나 level < 3이면 거절 문자열, 허용이면 `undefined`를 반환한다. 사용자 권한과 서버 AI 사용 권한은 별개의 검사다.
- `/itvsumm`은 서버 AI 권한 검사를 하지만 `/itvques`의 회원별 가드를 공유하지 않는다. `/itvimgen` 명령 본문에도 같은 가드가 없으므로 모든 AI 명령이 동일한 명령 계층 권한 정책이라고 일반화하지 않는다.
- `/itvques`, `/itvsumm`, `/itvsc`, `/itvstat`, `/itvimgen`은 실행 중 guild ID 부재를 거절한다. 등록 단계 Guild context 제한은 이들 모두에 설정되어 있지 않다. 새 서버 전용 명령은 등록 문맥과 실행 가드를 함께 검토한다.

### 주의사항과 권장 방향

`onModalSubmit`은 custom ID만 분기하며 권한을 다시 확인하지 않는다. 기존 명령 입구의 권한 확인이 모달 처리 전체에 자동 적용된다고 가정하지 않는다. 저장 경계와 사용자별 권한을 변경할 때 제출 경로도 검토한다. 설정 저장 시 `undefined` 처리와 audit 필드의 실제 갱신 여부를 모델 기본값만 보고 추정하지 않는다.

## 4. interaction 응답과 오류

### 관찰된 정상 패턴

- 빠른 거절은 `await interaction.reply(...)` 후 **return**한다.
- 외부 생성·검색·집계는 `deferReply()` 후 `editReply(...)`한다. 이 저장소의 현재 9개 명령/설정 제출은 `MessageFlags.Ephemeral`을 사용하지 않는다. 자동 삭제는 비공개 응답이 아니며, 임의의 ephemeral 전환은 가시성 계약 변경이다.
- 공급자 오류는 해당 명령에서 logger에 남기고 [replyMessagePerError](../../src/utils/error.ts)를 사용한다. 예: `question.execute`는 `interaction.editReply.bind(interaction)`을 넘긴다. 메서드를 bare function으로 넘겨 `this` 바인딩을 잃지 않는다.
- 정상 서비스 결과가 없거나 결과 전송에 실패한 경우는 별도 문구를 사용한다. `question`/`summarize`/`imageGeneration`은 `[001]`, `[002]` 등 오류 위치 표시를 보존한다.
- 지연 삭제 오류 처리는 [statistics.ts](../../src/service/commands/statistics.ts)의 async timeout 내부 `try/catch`가 관측 가능한 예다. `whoami`/`search`의 회수하지 않은 삭제 Promise를 권장 형태로 복제하지 않는다.

```ts
// question.ts execute의 실제 패턴 발췌
await interaction.deferReply();
// 서비스 실패 catch 내부
await replyMessagePerError(
  e,
  '답변을 생성할 수 없습니다.',
  interaction.editReply.bind(interaction)
);
```

### 현재 위험: 그대로 따라 하지 않을 것

- `summarize.execute`는 hours/count 둘 다 입력된 분기에서 `reply` 후 return이 없어 후속 defer가 가능하다. 배타적 옵션 거절은 즉시 종료해야 한다.
- `imageGeneration.execute`는 이미 defer한 뒤 입력 이미지 변환 실패에서 `interaction.reply(failMessage)`를 호출한다. 이 시점에는 `editReply`가 올바른 응답 단계다.
- 일부 설정/권한 조회는 defer보다 앞에 있어 외부 지연 시 3초 창을 넘길 수 있다. 응답 유예 시점은 DB 지연까지 포함해 설계하되 모달 응답과 혼용하지 않는다.
- `replyMessagePerError`는 OpenAI 오류 일부를 분류하지만 일반 오류 문자열을 사용자 문구에 포함한다. 모든 내부 정보가 이미 제거되는 보안 경계로 간주하지 않는다.
- `changelog.execute`는 fetch 전에 defer하지 않고 HTTP 성공 상태도 확인하지 않는다. 네트워크 요청을 빠른 즉시 응답의 보장으로 취급하지 않는다.

## 5. 문맥·작성자·저장소 identity

[utils/discord/index.ts](../../src/utils/discord/index.ts)의 helper가 공통 계약이다. feature별 유사 helper를 새로 정의하지 않는다.

| Symbol | 관찰된 계약 |
|---|---|
| `getSenderId` | `Message`는 author.id, interaction은 member.user.id 또는 user.id |
| `getGuildMember` | guild/member ID 없으면 undefined; guild/member 캐시 후 fetch, 조회 실패도 undefined |
| `resolveGuildMember` | 먼저 공통 회원 조회, 실패하면 message.guild에서 다시 fetch; Message/PartialMessage 지원 |
| `getSenderName` | nickname → displayName → user.displayName → globalName → username; 회원 없으면 통신사 IP 형태 익명 표시 |
| `getAvatarUrl` | 서버 아바타/표시 아바타/사용자 아바타/기본 아바타 순 fallback; 회원 없으면 빈 문자열 |
| `getMessageIdentityFilter` | guildId/channelId/messageId 중 하나라도 falsy면 null, 모두 있으면 세 문자열 반환; Snowflake 형식 검증은 하지 않음 |
| `getMessageIdentityFilterFromMessage` | Message/PartialMessage의 guildId/channelId/id를 위 함수로 전달 |
| `getLogContext` | Message 또는 Interaction에서 **비동기** 문맥 추출; 계약상 `LogContext | undefined` |

### LogContext 필드 규칙

- 평탄한 필드 `senderName`, `senderMessage`, `senderId`, `messageId`, `messageType`, `guildName`, `guildId`, `channelName`, `channelId`와 `createdAt: Date`를 사용한다.
- `attachments: unknown[]`, `components: TopLevelComponent[]`, `embeds: Embed[]`, 선택 `guildMember`, `channel`, `threadName`, `threadId`도 포함한다.
- Message의 첨부는 `.toJSON()`으로 변환하지만 components/embeds는 현재 객체 배열을 유지한다. interaction의 세 배열은 비어 있고 senderMessage는 message content가 아니라 interaction.context 문자열이다.
- 채널 문맥은 guild 안의 members/channels/roles/emojis/stickers를 null로 치환한 축약 객체다. 전체 Discord client/cache를 직렬화하는 대체 문맥을 만들지 않는다.
- `senderId`는 `guildMember?.id || message.member?.user.id || ''`이므로 `getSenderId`와 동일한 fallback은 아니다. 문맥이 존재해도 guild/channel/sender 값은 빈 문자열일 수 있다. **문맥 존재 검사를 유효한 저장소 키 검사 대신 사용하지 않는다.**
- 익명 embed는 표시 정책이지 로그 익명화 정책이 아니다. 문맥에는 원작성자와 원문이 남을 수 있으므로 공개 응답에 문맥 전체를 복사하지 않는다.

```ts
// 기존 helper를 사용한 통합 형태 예시(새 런타임 구현 아님)
const identity = getMessageIdentityFilterFromMessage(message);
if (!identity) return;
const context = await getLogContext(message);
if (!context) return;
// 저장소 조건은 identity, 공통 로그 문맥은 context로 각각 전달한다.
```

## 6. 아이콘·이미지 payload와 재게시

### 아이콘 흐름

- [parseIconSearchKeyword](../../src/utils/index.ts)는 `~` 접두어를 제거하고 첫 공백으로 나눈 검색어와 나머지 문자열을 반환한다.
- [replaceIcon](../../src/service/iconService.ts)은 검색어가 없거나 비익명 추가 문자열이 있으면 종료한다. `isAnonMessage`는 첫 토큰 이후 인자가 정확히 하나이며 `익명`, `ㅇㅇ`, `anon` 중 하나일 때만 true다.
- `getLogContext`의 guild ID와 문맥으로 `IconSearchEngine.instance.searchIcon`을 호출하고, 매칭되면 `sendAndDeleteIconMessage`로 넘긴다.
- `createIconEmbedMessagePayload`는 `Icon.isRemoteImage`에 따라 URL embed 또는 `AttachmentBuilder`+`attachment://` 참조를 만든다. 로컬 첨부 이름은 `image.<원래 확장자>`이고 키워드가 설명에 쓰인다. 파일명은 ASCII로 유지하고 attachment 참조와 정확히 맞춘다.
- 프로필은 `await createUserProfileEmbed(...)`를 재사용한다. DarkBlue 색, 원본 createdTimestamp, 작성자 fallback을 공유한다. 익명이면 `ㅇㅇ (통신사 IP)`와 원작성자의 기본 아바타를 사용한다.
- embed 실패 시 `createIconFileMessagePayload`로 파일 전송 fallback을 시도한다. 두 payload 모두 `MessageFlags.SuppressNotifications`를 유지한다. 이 flag는 ephemeral이나 멘션 완전 차단과 같은 의미가 아니다.

**주의사항:** 현재 `sendAndDeleteIconMessage`는 전송 체인과 `deleteMessage` 체인을 따로 시작한다. 전송 성공 후에만 원문을 삭제하는 보장이 없다. 새 구현은 전송 완료를 확인한 다음 삭제하고, 전송 실패로 원문까지 잃지 않게 해야 한다. `deleteMessage` 자체도 deletable 확인 후 삭제 실패를 로깅하고 삼키므로 resolve가 삭제 성공의 증거는 아니다.

### 작은 첨부 이미지를 embed로 바꾸는 흐름

[replaceImageToEmbed](../../src/service/imageToEmbedService.ts)은 설정이 활성화된 메시지에서 다음을 검사한다.

1. 전체 첨부가 이미지이고 정확히 하나여야 한다. components/stickers/embeds가 있거나 spoiler 첨부이면 제외한다.
2. `getIconImageBuffer`는 fetch 응답 상태와 image content-type을 확인한다. 비율 오차 `abs(1 - height/width) < 0.1`, 너비·높이 각각 `<= 201`인 이미지를 대상으로 한다. 모달의 “200px 이하” 문구와 실제 경계가 다르므로 코드의 201을 200으로 단정하지 않는다.
3. sharp는 animated 옵션으로 다시 열고, `base64ImageToAttachment`로 첨부를 만든다. 이 helper는 data URL 또는 순수 base64를 받아 `image.<ext>`를 만들며 spoiler 옵션이면 `SPOILER_`를 붙인다.
4. `createUserProfileEmbed(message, undefined, { description: message.content })`와 attachment URL을 사용한다. 알림 억제 전송이 성공한 then 안에서 원문 삭제를 시작한다. 다만 외부 함수가 이 Promise chain을 await/return하지 않는 위험은 별개다.
5. 이미지 생성 명령은 같은 첨부 helper를 `{ spoiler: true }`로 쓰고 image embed를 일부러 넣지 않는다. spoiler 파일을 일반 이미지 embed로 바꿔 표시 정책을 깨지 않는다.

## 7. 독립 LLM 블랙박스 구현과 비교

### 방법과 요구사항

실제 기능을 소스로 먼저 조사한 뒤, 도구·파일·대화 이력이 없는 `completion(prompt, system=...)` 별도 요청 두 건을 보냈다. 요청에는 기능·공개 입력/출력·기술만 전달했고 소스, 기존 helper 이름, 파일 경로, 기대 오답은 주지 않았다. 응답의 코드를 실행하거나 적용하지 않았다. 아래는 실제 요청 전문과 응답 일부다. 별도 설계로 합당한 선택은 일반적인 오답이 아니라 **이 레포 계약에 맞지 않는 예시**로 분류한다.

두 요청의 실제 system:

> 당신은 이 저장소의 파일, 소스, 내부 이름, 관례를 전혀 모르는 독립 구현자입니다. 주어진 기능 요구만으로 TypeScript/discord.js 예시를 작성하십시오. 도구 사용, 파일 조회, 실행, 실제 적용은 하지 않습니다. 코드와 간단한 설명을 답하십시오.

### 요청 A: `discord-command-routing`

> Node.js 24, TypeScript strict, CommonJS, discord.js로 Discord 봇의 슬래시 명령 추가와 라우팅 예시를 작성해 주세요. 기능은 현재 서버의 최근 메시지에 대한 질문 답변입니다. 입력은 필수 질문 문자열과 선택 메시지 건수(100~1000, 기본 500)입니다. 서버에서만 동작하고, 일반 회원 허용 설정이 켜졌거나 회원이 중재 권한 또는 서버별 추가 허용 사용자 목록에 속할 때 실행할 수 있습니다. 서버의 AI 요청 허용 여부도 확인합니다. 실패는 사용자에게 안전한 문장으로 알리고, 3초 이상 걸릴 수 있는 외부 답변 생성은 미리 응답을 유예합니다. 답변 생성 함수와 서버 설정 조회 함수는 공개 인터페이스를 직접 정의해도 됩니다. 파일별 명령 정의와 이벤트 라우터 예시를 포함해 주세요.

실제 응답 발췌(이름·문자 보존; 서로 떨어진 부분은 각각 분리):

```ts
export const askRecentCommand = {
  data: new SlashCommandBuilder()
    .setName("ask-recent")
```

```ts
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });
```

```ts
      await command.execute(interaction, services);
```

| 비교 | 판정과 올바른 통합 형태 |
|---|---|
| 객체 하나 `askRecentCommand` export | 독립 설계로 유효하지만 현재 로더는 최상위 `data`/`execute`만 인식한다. `export const data = ...`, `export const execute = async (interaction: ChatInputCommandInteraction) => ...` 형태가 맞다. |
| 명령 이름 `ask-recent`, 입력 `question` | 요구에 이름을 지정하지 않아 합당한 선택이다. 기존 기능을 대체할 때는 실제 `/itvques`, 옵션 `q`/`count` 계약을 보존해야 한다. |
| `execute(interaction, services)` 주입 | 독립 앱 구조로 유효하다. 기존 로더는 interaction 한 개만 전달하므로 현재 messageService/settingService/auth helper를 기존 import 경로로 재사용한다. 두 번째 인자가 올 것이라 가정하지 않는다. |
| ephemeral defer | 좋은 개인정보 설계 선택일 수 있으나 현재 `/itvques`는 공개 defer다. 응답 가시성을 의도적으로 승인/변경하지 않고 복사하면 동작이 달라진다. |
| 별도 Map 라우터 | 독립 설계로 유효하나 현재 `readCommands` 및 배포 배열과 다른 두 번째 레지스트리를 만들면 등록/실행 경로가 갈라진다. 기존 디스패처에 통합한다. |
| 설정 조회 전 defer, await 실행, 안전한 오류 문구 | 현재 위험을 개선하는 방향이다. 기존 미await·원시 오류 노출을 맞춰야 할 컨벤션으로 취급하지 않는다. |
| 서버 전체 최근 대화 수집 계약 | 요청의 “서버의 최근 메시지”를 넓게 해석한 설계다. 현재 `questionLastMessages` 호출에는 현재 `channelId`를 전달한다. 기존 질의 기능을 바꿀 때 서버 전체 범위로 조용히 확대하지 않는다. |

올바른 모듈 외형 예시(응답 원문이 아닌 레포 통합 형태):

```ts
// question.ts가 사용하는 현재 명명/로더 계약
export const data = new SlashCommandBuilder()
  .setName('itvques')
  .setDescription('이전 대화내역을 기반으로 질문을 검색합니다.');
// 실제 명령에는 위 표의 q/count 옵션과 기존 execute 본문도 함께 유지한다.
```

### 요청 B: `discord-repost-context`

> Node.js 24, TypeScript strict, CommonJS, discord.js로 메시지를 아이콘 이미지 임베드로 재게시하는 예시를 작성해 주세요. 입력은 일반 메시지 또는 부분 메시지와 사전에 매칭된 아이콘(이미지 경로, 원격 여부), 표시 키워드, 익명 표시 여부입니다. 봇 메시지와 텍스트 채널이 아닌 곳은 처리하지 않습니다. 임베드는 작성자 표시명/아바타와 원본 작성 시간을 사용하되 익명이면 익명 이름과 기본 아바타로 표시합니다. 원격 이미지는 URL을, 로컬 이미지는 첨부 파일을 사용합니다. 재게시 알림은 억제하며 성공한 뒤 원문을 삭제할 수 있습니다. 서버/채널/메시지 식별자는 후속 저장소의 복합 키로 사용하고, 값이 부족하면 유효한 키를 만들지 않습니다. 로그용 문맥에는 발신자, 원문, 서버/채널, 첨부/임베드/컴포넌트, 작성 시각이 필요합니다. 캐시에서 회원 정보를 못 찾으면 API 조회를 시도하되 조회 실패가 봇 전체를 중단시키면 안 됩니다. 필요한 인터페이스와 구현 예시를 제시해 주세요.

실제 응답 발췌(별도 위치 각각 분리):

```ts
export interface LogContext {
  readonly sender: {
    readonly id: string;
    readonly username: string;
    readonly displayName: string;
    readonly bot: boolean;
  } | null;
```

```ts
    createdAt:
      createdAt && Number.isFinite(createdAt.getTime())
        ? createdAt.toISOString()
        : null,
```

```ts
      const attachmentName = "icon.png";
```

```ts
    const avatarURL = input.anonymous
      ? "https://cdn.discordapp.com/embed/avatars/0.png"
      : member?.displayAvatarURL() ??
        message.author.displayAvatarURL();
```

| 비교 | 판정과 올바른 통합 형태 |
|---|---|
| nested sender/guild/channel 및 ISO 문자열 createdAt | 독립 로그 스키마로는 합당하나 현재 `LogContext`의 평탄 필드와 `Date` 계약에 맞지 않는다. `await getLogContext(message)`를 사용한다. |
| `makeMessageKey`와 Snowflake 정규식/BigInt 검사 | 요구보다 엄격한 별도 설계다. 현재 helper는 세 ID의 존재만 확인한다. 별도 validator를 기능마다 추가하지 말고 `getMessageIdentityFilterFromMessage`를 사용한다. 추가 형식 검증은 공통 계약 변경으로 다룬다. |
| `remote` 아이콘 필드 | 현재 `Icon.isRemoteImage`와 다르다. 현재 모델과 `createIconEmbedMessagePayload` 입력을 재사용한다. |
| 고정 `icon.png` | 응답도 PNG 가정을 명시한다. 현재 저장소에는 확장자를 유지하는 `image.<ext>` 규칙이 있다. 비PNG 원본에 고정 확장자를 붙이지 않는다. |
| 고정 기본 아바타 URL, 익명 이름 옵션 | 별도 앱에서 가능한 정책이나 현재 helper의 `ㅇㅇ (통신사 IP)` 및 원작성자 기본 아바타와 다르다. `createUserProfileEmbed`를 재사용한다. |
| partial fetch, 봇/채널 가드, 전송 성공 뒤 삭제 | 요청 요구를 충족하는 유효한 방어 패턴이다. 현재 메인 경로에 그 가드가 있다고 주장하지 않는다. 현재 아이콘 삭제 경쟁은 개선 대상이지 따라야 할 계약이 아니다. |
| 알림 억제와 attachment 이름 일치 | 현재 payload와도 일치하는 좋은 패턴이다. 기존 builder를 재사용하면 중복 구현 없이 유지된다. |

올바른 helper 통합 예시(응답 원문이 아닌 레포 계약 표현):

```ts
const context = await getLogContext(message);
if (!context) return;
const payload = await createIconEmbedMessagePayload(
  message,
  matchKeyword,
  matchIcon,
  asAnonUser
);
// 채널/partial 가드를 충족한 전송 경계에서 payload 사용.
// 원문 삭제는 전송 성공을 확인한 뒤 처리한다.
```

## 8. 편집 체크리스트

- [ ] 새 명령은 `_`로 시작하지 않는 TS 파일이고 named `data`/`execute`를 제공하는가? 기존 로더·배포 배열을 재사용하는가?
- [ ] 사용자 명령명/옵션명과 기본값·범위·가시성·삭제 시간이 현재 계약과 일치하는가? 변경이라면 사용자 문서도 갱신하는가?
- [ ] 사용자 권한, 서버별 AI 허용, 서버/채널 문맥을 서로 다른 검사로 다루는가?
- [ ] 모달 ID/필드 ID가 양쪽에서 일치하고 제출 시 권한·설정 해석도 검토했는가?
- [ ] 응답은 reply 또는 showModal로 시작하거나 defer 후 editReply로 이어지는가? 거절 뒤 return이 있는가?
- [ ] handler/서비스 Promise의 완료·실패를 부모가 관측하는가? timeout 안의 삭제 실패도 처리하는가?
- [ ] `getLogContext`/identity helper/프로필·첨부·아이콘 builder를 재사용하고 await하는가?
- [ ] 로그 문맥을 저장소 identity로 오용하거나 공개 응답으로 노출하지 않는가? 익명 표시와 로그 보존을 구분하는가?
- [ ] partial·봇·채널 가드와 원문 삭제 순서를 명시적으로 검토했는가?
- [ ] ASCII 첨부 이름, 실제 확장자, attachment URL 일치, SuppressNotifications, spoiler 표시를 보존하는가?
- [ ] 기존 버그를 예제로 복제하거나 독립 LLM의 합당한 다른 설계를 일반적 오답이라고 기술하지 않았는가?
