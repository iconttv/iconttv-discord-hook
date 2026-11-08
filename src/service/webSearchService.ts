import MessageModel from '../database/model/MessageModel';
import { getMessageLink } from '../utils/message';
import {
  searchMessage,
  searchMessageEmbedding,
  MessageSearchBackendError,
} from './elasticService';
import { buildMongoSearchFilter, WEB_PAGE_SIZE } from '../web/searchQuery';
import type {
  WebSearchOptions,
  WebSearchResult,
  WebSearchScope,
} from '../web/types';
import {
  archivedMentions,
  archivedEditedTimestamp,
  archivedImages,
  archivedMessageContent,
} from '../web/messagePresentation';
import {
  BackendUnavailable,
  CircuitBreaker,
  SemanticSearchUnavailable,
} from '../web/circuitBreaker';
import logger from '../lib/logger';

const elasticCircuit = new CircuitBreaker();

export const searchWebMessages = async (
  session: WebSearchScope,
  options: WebSearchOptions
): Promise<WebSearchResult> => {
  if (!session.channels.length)
    return {
      messages: [],
      page: options.page,
      hasMore: false,
      total: 0,
      source: 'elasticsearch',
    };
  if (
    options.channelId &&
    !session.channels.some(channel => channel.id === options.channelId)
  )
    throw new Error('Channel is outside session scope.');
  return elasticCircuit.run(
    () => searchElastic(session, options),
    () => {
      if (options.keyword && options.mode === 'semantic')
        throw new SemanticSearchUnavailable();
      return searchStoredMessages(session, options);
    }
  );
};

const searchElastic = async (
  session: WebSearchScope,
  options: WebSearchOptions
): Promise<WebSearchResult> => {
  const searchOptions = {
    allowedChannelIds: session.channels.map(channel => channel.id),
    after: options.after,
    before: options.before,
    sort: options.sort,
    offset: (options.page - 1) * WEB_PAGE_SIZE,
    limit: WEB_PAGE_SIZE + 1,
    raw: true as const,
  };
  const result = await (async () => {
    try {
      const search =
        options.mode === 'semantic' ? searchMessageEmbedding : searchMessage;
      const response = await search(
        session.guildId,
        options.keyword,
        options.channelId ?? null,
        searchOptions
      );
      if (response.timed_out || (response._shards.failed ?? 0) > 0)
        throw new BackendUnavailable();
      return response;
    } catch (error) {
      // Provider failures and invalid scope are not Elasticsearch outages.
      if (!(error instanceof MessageSearchBackendError)) throw error;
      const cause = error.cause;
      const status =
        cause && typeof cause === 'object' && 'statusCode' in cause
          ? cause.statusCode
          : undefined;
      // A malformed query is an implementation/configuration problem, not a
      // dependency outage; don't silently hide it behind a different search.
      if (status === 400) throw cause;
      logger.warn(
        'Elasticsearch request unavailable; using the web search circuit breaker.'
      );
      throw new BackendUnavailable();
    }
  })();
  const channels = new Map(
    session.channels.map(channel => [channel.id, channel.name])
  );
  const hits = result.hits.hits.slice(0, WEB_PAGE_SIZE).flatMap(hit => {
    const source = hit._source;
    if (
      !source?.messageId ||
      !source.channelId ||
      source.guildId !== session.guildId ||
      !channels.has(source.channelId) ||
      (options.channelId && source.channelId !== options.channelId)
    )
      return [];
    return [
      { ...source, channelId: source.channelId, messageId: source.messageId },
    ];
  });
  // The index can lag edits/deletes. Only return hits whose current, non-deleted
  // archive record can be verified. A failed lookup must never expose stale text.
  const archived = hits.length
    ? await MessageModel.find({
        guildId: session.guildId,
        isDeleted: { $ne: true },
        $or: hits.map(hit => ({
          channelId: hit.channelId,
          messageId: hit.messageId,
        })),
      })
        .select(
          'channelId messageId senderId senderName message createdAt editedAt isDeleted raw attachments EMBEDDING_INPUT'
        )
        .maxTimeMS(1500)
        .lean()
    : [];
  const stored = new Map(
    archived.map(message => [
      `${message.channelId}:${message.messageId}`,
      message,
    ])
  );
  const messages = hits.flatMap(hit => {
    const message = stored.get(`${hit.channelId}:${hit.messageId}`);
    if (!message || message.isDeleted) return [];
    const images = archivedImages(message.attachments, message.raw);
    return [
      {
        id: hit.messageId,
        channelId: hit.channelId,
        channelName: channels.get(hit.channelId)!,
        senderId: message?.senderId ?? hit.senderId ?? '',
        senderName:
          message?.senderName ?? hit.senderName ?? '알 수 없는 사용자',
        parentChannelName: session.channels.find(
          channel => channel.id === hit.channelId
        )?.parentName,
        timestamp: message?.createdAt?.toISOString() ?? hit['@timestamp'] ?? '',
        editedTimestamp: archivedEditedTimestamp(message.editedAt, message.raw),
        images,
        mentions: archivedMentions(message?.raw ?? hit.raw),
        content: archivedMessageContent(
          message,
          images.length,
          hit.message ?? hit.embeddingInput ?? ''
        ),
        link: getMessageLink(session.guildId, hit.channelId, hit.messageId),
      },
    ];
  });
  return {
    messages,
    page: options.page,
    hasMore: result.hits.hits.length > WEB_PAGE_SIZE && options.page < 100,
    total:
      typeof result.hits.total === 'number'
        ? result.hits.total
        : (result.hits.total?.value ?? 0),
    source: 'elasticsearch',
  };
};

const searchStoredMessages = async (
  session: WebSearchScope,
  options: WebSearchOptions
): Promise<WebSearchResult> => {
  const channelMap = new Map(
    session.channels.map(channel => [channel.id, channel])
  );
  const filter = buildMongoSearchFilter(session, options);
  const [documents, total] = await Promise.all([
    MessageModel.find(filter)
      .sort({
        createdAt: options.sort === 'oldest' ? 1 : -1,
        messageId: options.sort === 'oldest' ? 1 : -1,
      })
      .skip((options.page - 1) * WEB_PAGE_SIZE)
      .limit(WEB_PAGE_SIZE + 1)
      .select(
        'channelId messageId senderId senderName message createdAt editedAt raw EMBEDDING_INPUT attachments'
      )
      .maxTimeMS(10000)
      .lean(),
    MessageModel.countDocuments(filter).maxTimeMS(10000),
  ]);
  return {
    messages: documents.slice(0, WEB_PAGE_SIZE).map(message => {
      const images = archivedImages(message.attachments, message.raw);
      return {
        id: message.messageId,
        channelId: message.channelId,
        channelName: channelMap.get(message.channelId)!.name,
        parentChannelName: channelMap.get(message.channelId)?.parentName,
        senderId: message.senderId,
        senderName: message.senderName ?? '알 수 없는 사용자',
        timestamp: message.createdAt?.toISOString() ?? '',
        editedTimestamp: archivedEditedTimestamp(message.editedAt, message.raw),
        images,
        mentions: archivedMentions(message.raw),
        content:
          archivedMessageContent(message, images.length) ||
          (!images.length && message.attachments?.length
            ? '[첨부파일이 있는 메시지]'
            : ''),
        link: getMessageLink(
          session.guildId,
          message.channelId,
          message.messageId
        ),
      };
    }),
    page: options.page,
    hasMore: documents.length > WEB_PAGE_SIZE && options.page < 100,
    total,
    source: 'mongodb',
  };
};
