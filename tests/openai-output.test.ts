import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getChatCompletionText,
  stripReasoningText,
} from '../src/utils/openai';
import {
  constructQuestionResult,
  constructSummarizationResult,
} from '../src/utils/message';

test('excludes separate reasoning fields and non-answer content parts', () => {
  const message = {
    reasoning: 'private reasoning',
    reasoning_content: 'private chain',
    reasoning_details: [{ text: 'private details' }],
    content: [
      { type: 'thinking', text: 'private thinking' },
      { type: 'reasoning', text: 'private reasoning' },
      { type: 'text', text: '최종 ' },
      { type: 'output_text', text: '답변' },
      { type: 'image_url', text: 'not answer text' },
      null,
    ],
  };
  assert.equal(getChatCompletionText(message), '최종 답변');
  assert.equal(getChatCompletionText({ ...message, content: null }), undefined);
  assert.equal(getChatCompletionText(undefined), undefined);
});

test('removes nested and repeated inline reasoning without truncating the answer', () => {
  const answer = '최종 답변 '.repeat(400);
  assert.equal(
    stripReasoningText(
      `<THINK>private<thinking>nested</thinking>private</THINK>${answer}<reasoning>tail</reasoning>`
    ),
    answer.trim()
  );
});

test('mismatched closing tags cannot expose unfinished reasoning', () => {
  assert.equal(stripReasoningText('<think>private</reasoning>still private'), '');
  assert.equal(stripReasoningText('<think/>최종 답변'), '최종 답변');
});

test('does not expose an unfinished thinking block', () => {
  assert.equal(stripReasoningText('답변<think>private unfinished'), '답변');
  assert.equal(getChatCompletionText({ content: '<thinking>private' }), undefined);
});

test('preserves ordinary reasoning terminology and unrelated markup', () => {
  const answer = 'thinking 모델의 reasoning 설정과 <code>코드</code> 설명';
  assert.equal(stripReasoningText(answer), answer);
});

test('parses JSON following inline thinking and preserves evidence links', () => {
  const answer = constructQuestionResult(
    'guild',
    'channel',
    '<think>private</think>```json\n' + JSON.stringify({
      answer: '최종 답변',
      startMessageIds: ['message'],
    }) + '\n```'
  );
  assert.equal(
    answer,
    '최종 답변\n\nhttps://discord.com/channels/guild/channel/message'
  );
});

test('excludes long reasoning embedded in the structured answer field', () => {
  const answer = constructQuestionResult('guild', 'channel', JSON.stringify({
    answer: `<think>${'private '.repeat(500)}</think>최종 답변`,
    startMessageIds: [],
  }));
  assert.equal(answer, '최종 답변\n\n');
});

test('filters summary topics and comment without changing topic references', () => {
  const result = constructSummarizationResult('guild', 'channel', JSON.stringify({
    topics: [{
      topic: '<thinking>private</thinking>배포 논의',
      startMessageId: 'message',
    }],
    comment: '<reasoning>private</reasoning>최종 코멘트',
  }));
  assert.equal(
    result,
    '- 배포 논의 https://discord.com/channels/guild/channel/message\n\n최종 코멘트'
  );
});

test('does not turn malformed answer JSON into a successful response', () => {
  assert.throws(
    () => constructQuestionResult('guild', 'channel', '<think>private</think>not json'),
    SyntaxError
  );
});
