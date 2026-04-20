import { Guild, VoiceState } from 'discord.js';
import VoiceStateModel, {
  type VoiceStreamType,
} from '../../database/model/VoiceStateModel';

const STREAM_TYPES: readonly VoiceStreamType[] = ['streaming', 'selfVideo'];

type ActiveVoiceStateDocument = {
  _id: unknown;
  guildId: string;
  channelId: string;
  memberId: string;
  streamType: VoiceStreamType;
  guildName?: string | null;
  channelName?: string | null;
  memberName?: string | null;
  streamingStartAt?: Date | null;
};

type VoiceStateSnapshot = {
  guildId: string;
  channelId: string;
  memberId: string;
  guildName: string;
  channelName: string;
  memberName: string;
};

const getStreamingKey = ({
  guildId,
  channelId,
  memberId,
  streamType,
}: Pick<VoiceStateSnapshot, 'guildId' | 'channelId' | 'memberId'> & {
  streamType: VoiceStreamType;
}) => {
  return `${guildId}:${channelId}:${memberId}:${streamType}`;
};

const isStreamTypeActive = (
  voiceState: VoiceState,
  streamType: VoiceStreamType
) => {
  if (streamType === 'streaming') {
    return Boolean(voiceState.streaming);
  }

  return Boolean(voiceState.selfVideo);
};

const getMemberName = (voiceState: VoiceState) => {
  const member = voiceState.member;
  if (!member) {
    return '';
  }

  return (
    member.displayName ??
    member.nickname ??
    member.user.displayName ??
    member.user.globalName ??
    member.user.username ??
    ''
  );
};

const toSnapshot = (voiceState: VoiceState): VoiceStateSnapshot | null => {
  const guildId = voiceState.guild?.id ?? '';
  const channelId = voiceState.channelId ?? voiceState.channel?.id ?? '';
  const memberId = voiceState.id ?? voiceState.member?.id ?? '';

  if (!guildId || !channelId || !memberId) {
    return null;
  }

  return {
    guildId,
    channelId,
    memberId,
    guildName: voiceState.guild?.name ?? '',
    channelName: voiceState.channel?.name ?? '',
    memberName: getMemberName(voiceState),
  };
};

const toActiveProjection = {
  _id: 1,
  guildId: 1,
  channelId: 1,
  memberId: 1,
  streamType: 1,
  guildName: 1,
  channelName: 1,
  memberName: 1,
  streamingStartAt: 1,
} as const;

const getStreamingElapsed = (startAt: Date | null | undefined, endAt: Date) => {
  if (!startAt) {
    return 0;
  }

  return Math.max(0, Math.floor((endAt.getTime() - startAt.getTime()) / 1000));
};

const closeStreamingDocuments = async (
  documents: ActiveVoiceStateDocument[],
  now: Date,
  snapshot?: Partial<VoiceStateSnapshot>
) => {
  await Promise.all(
    documents.map(document => {
      return VoiceStateModel.updateOne(
        { _id: document._id, streamType: document.streamType },
        {
          streamType: document.streamType,
          guildName: snapshot?.guildName || document.guildName || '',
          channelName: snapshot?.channelName || document.channelName || '',
          memberName: snapshot?.memberName || document.memberName || '',
          isStreaming: false,
          streamingEndAt: now,
          streamingElapsed: getStreamingElapsed(document.streamingStartAt, now),
          updatedAt: now,
        }
      );
    })
  );
};

const createCompletedVoiceState = async (
  voiceState: VoiceState,
  streamType: VoiceStreamType,
  now: Date
) => {
  const snapshot = toSnapshot(voiceState);
  if (!snapshot) {
    return;
  }

  await VoiceStateModel.create({
    ...snapshot,
    streamType,
    isStreaming: false,
    streamingStartAt: now,
    streamingEndAt: now,
    streamingElapsed: 0,
    createdAt: now,
    updatedAt: now,
  });
};

const openStreamingState = async (
  voiceState: VoiceState,
  streamType: VoiceStreamType,
  now: Date
) => {
  const snapshot = toSnapshot(voiceState);
  if (!snapshot) {
    return;
  }

  const existingActiveDocument = await VoiceStateModel.findOne(
    {
      guildId: snapshot.guildId,
      channelId: snapshot.channelId,
      memberId: snapshot.memberId,
      streamType,
      isStreaming: true,
    },
    toActiveProjection
  )
    .sort({ streamingStartAt: -1, createdAt: -1 })
    .lean<ActiveVoiceStateDocument>();

  if (existingActiveDocument?._id) {
    return;
  }

  await VoiceStateModel.create({
    ...snapshot,
    streamType,
    isStreaming: true,
    streamingStartAt: now,
    streamingEndAt: null,
    streamingElapsed: null,
    createdAt: now,
    updatedAt: now,
  });
};

const closeStreamingState = async (
  voiceState: VoiceState,
  streamType: VoiceStreamType,
  now: Date
) => {
  const snapshot = toSnapshot(voiceState);
  if (!snapshot) {
    return;
  }

  const activeDocuments = await VoiceStateModel.find(
    {
      guildId: snapshot.guildId,
      channelId: snapshot.channelId,
      memberId: snapshot.memberId,
      streamType,
      isStreaming: true,
    },
    toActiveProjection
  ).lean<ActiveVoiceStateDocument[]>();

  if (activeDocuments.length > 0) {
    await closeStreamingDocuments(activeDocuments, now, snapshot);
    return;
  }

  await createCompletedVoiceState(voiceState, streamType, now);
};

export const onArchiveVoiceStateUpdate = async (
  oldState: VoiceState,
  newState: VoiceState,
  now: Date = new Date()
) => {
  await Promise.all(
    STREAM_TYPES.map(async streamType => {
      const wasActive = isStreamTypeActive(oldState, streamType);
      const isActive = isStreamTypeActive(newState, streamType);
      const oldChannelId = oldState.channelId ?? oldState.channel?.id ?? '';
      const newChannelId = newState.channelId ?? newState.channel?.id ?? '';

      if (wasActive && isActive && oldChannelId !== newChannelId) {
        await closeStreamingState(oldState, streamType, now);

        if (newChannelId) {
          await openStreamingState(newState, streamType, now);
        }
        return;
      }

      if (wasActive === isActive) {
        return;
      }

      if (!wasActive && isActive && newState.channelId) {
        await openStreamingState(newState, streamType, now);
        return;
      }

      if (wasActive && !isActive) {
        await closeStreamingState(oldState, streamType, now);
      }
    })
  );
};

const reconcileGuildStreamTypeStates = async (
  guild: Guild,
  streamType: VoiceStreamType,
  now: Date
) => {
  const activeStreamingStates = guild.voiceStates.cache.filter(voiceState => {
    return Boolean(isStreamTypeActive(voiceState, streamType) && voiceState.channelId);
  });

  const activeStreamingKeys = new Set(
    activeStreamingStates
      .map(voiceState => toSnapshot(voiceState))
      .filter((snapshot): snapshot is VoiceStateSnapshot => snapshot !== null)
      .map(snapshot => getStreamingKey({ ...snapshot, streamType }))
  );

  const persistedActiveDocuments = await VoiceStateModel.find(
    {
      guildId: guild.id,
      streamType,
      isStreaming: true,
    },
    toActiveProjection
  ).lean<ActiveVoiceStateDocument[]>();

  const staleDocuments = persistedActiveDocuments.filter(document => {
    return !activeStreamingKeys.has(getStreamingKey(document));
  });

  if (staleDocuments.length > 0) {
    await closeStreamingDocuments(staleDocuments, now);
  }

  for (const voiceState of activeStreamingStates.values()) {
    await openStreamingState(voiceState, streamType, now);
  }
};

export const reconcileGuildStreamingStates = async (
  guild: Guild,
  now: Date = new Date()
) => {
  await Promise.all(
    STREAM_TYPES.map(streamType => reconcileGuildStreamTypeStates(guild, streamType, now))
  );
};
