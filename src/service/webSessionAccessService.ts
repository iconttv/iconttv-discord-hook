import {
  Client,
  ClientUser,
  Routes,
  type APIUser,
  type Guild,
} from 'discord.js';
import { config } from '../config';
import WebSessionModel from '../database/model/WebSessionModel';
import {
  discoverWebChannels,
  selectReadableWebChannels,
} from './webChannelService';
import type { WebSession } from '../web/types';

// discord.js normally constructs this from a gateway READY event. The web
// process only uses REST, but thread members still require the bot's identity.
class RestClientUser extends ClientUser {
  constructor(client: Client, user: APIUser) {
    super(client as Client<true>, user);
  }
}

let clientReady: Promise<Client> | undefined;
const getRestClient = () => {
  if (!clientReady)
    clientReady = (async () => {
      const client = new Client({
        intents: [],
        rest: { timeout: 5000, retries: 0 },
      });
      client.rest.setToken(config.DISCORD_BOT_TOKEN);
      // Populate the bot identity used by discord.js thread structures without
      // logging into the gateway or starting the bot runtime.
      const user = (await client.rest.get(Routes.user('@me'))) as APIUser;
      client.user = new RestClientUser(client, user);
      return client;
    })().catch(error => {
      clientReady = undefined;
      throw error;
    });
  return clientReady;
};

interface AccessServices {
  loadGuild(id: string): Promise<Guild>;
  discoverChannels: typeof discoverWebChannels;
  save(session: WebSession): Promise<boolean>;
}

export const createWebSessionAccessResolver = (services: AccessServices) => {
  const pending = new Map<string, Promise<WebSession | null>>();
  return (session: WebSession): Promise<WebSession | null> => {
    if (session.accessResolvedAt) return Promise.resolve(session);
    const existing = pending.get(session.id);
    if (existing) return existing;
    const request = (async () => {
      const guild = await services.loadGuild(session.guildId);
      const [member, candidates] = await Promise.all([
        guild.members.fetch({ user: session.userId, force: true }),
        services.discoverChannels(guild),
      ]);
      if (
        session.initialChannelId &&
        !candidates.some(channel => channel.id === session.initialChannelId)
      ) {
        const current = await guild.channels
          .fetch(session.initialChannelId, { force: true })
          .catch(() => null);
        if (current?.guildId === guild.id) candidates.push(current);
      }
      const channels = await selectReadableWebChannels(candidates, member);
      const resolved: WebSession = {
        ...session,
        channels,
        permissions: member.permissions.bitfield.toString(),
        displayName: member.displayName,
        avatarUrl: member.displayAvatarURL({ size: 128 }),
        guildName: guild.name,
        guildIconUrl: guild.iconURL({ size: 128 }) ?? '',
        accessResolvedAt: new Date(),
      };
      if (
        resolved.expiresAt.getTime() <= Date.now() ||
        !(await services.save(resolved))
      )
        return null;
      return resolved;
    })()
      .catch(error => {
        if (
          error &&
          typeof error === 'object' &&
          'status' in error &&
          [403, 404].includes(Number(error.status))
        )
          return null;
        throw error;
      })
      .finally(() => pending.delete(session.id));
    pending.set(session.id, request);
    return request;
  };
};

export const resolveWebSessionAccess = createWebSessionAccessResolver({
  loadGuild: async id =>
    (await getRestClient()).guilds.fetch({ guild: id, force: true }),
  discoverChannels: discoverWebChannels,
  save: async session => {
    const { id, expiresAt, ...scope } = session;
    const result = await WebSessionModel.updateOne(
      { _id: id, expiresAt: { $eq: expiresAt, $gt: new Date() } },
      { $set: scope }
    ).maxTimeMS(5000);
    return result.matchedCount === 1;
  },
});
