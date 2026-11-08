export interface WebChannel {
  id: string;
  name: string;
  category: string;
  parentName?: string;
}

export interface WebSession {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  guildId: string;
  guildName: string;
  guildIconUrl: string;
  initialChannelId?: string;
  accessResolvedAt?: Date;
  channels: WebChannel[];
  permissions: string;
  expiresAt: Date;
}

export interface WebSearchOptions {
  keyword: string;
  channelId?: string;
  mode: 'text' | 'semantic';
  sort: 'relevance' | 'newest' | 'oldest';
  after?: string;
  before?: string;
  page: number;
}

export type WebSearchScope = Pick<WebSession, 'guildId' | 'channels'>;

export interface WebMessageImage {
  id: string;
  name: string;
  url: string;
  spoiler: boolean;
}

export interface WebSearchMessage {
  id: string;
  channelId: string;
  channelName: string;
  senderName: string;
  senderId: string;
  parentChannelName?: string;
  timestamp: string;
  editedTimestamp?: string;
  images?: WebMessageImage[];
  content: string;
  mentions?: {
    users: Record<string, string>;
    roles: Record<string, string>;
  };
  link: string;
}

export interface WebMessageReference {
  id: string;
  channelId: string;
}

export interface WebSearchResult {
  messages: WebSearchMessage[];
  page: number;
  hasMore: boolean;
  total: number;
  source: 'elasticsearch' | 'mongodb';
}

export interface WebSettings {
  enableFeatureIconImageResize: boolean;
  enableCommandQuestionForEveryone: boolean;
}
