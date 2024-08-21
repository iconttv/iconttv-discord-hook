import { jsonStringify } from './index';
import { config } from '../config';
import logger from '../lib/logger';

interface Embed {
  color: number;
  title: string;
  description?: string;
}

class Webhook {
  colors = {
    info: 3066993, // 녹색 (Information)
    warning: 16776960, // 노란색 (Warning)
    error: 15158332, // 빨간색 (Error)
  };

  // adapted from https://gist.github.com/dragonwocky/ea61c8d21db17913a43da92efe0de634
  async sendMessage(
    message: string,
    body?: any,
    level: 'info' | 'warning' | 'error' = 'info'
  ) {
    try {
      if (!config.WEBHOOK_DISCORD) {
        throw Error('Discord webhook url is missing.');
      }

      await this.__sendHeader(message, level);
      await this.__sendBody(body);
    } catch (e) {
      logger.error(`Failed to send discord webhook. ${e}`);
    }
  }

  async __sendHeader(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info'
  ) {
    const embeds: Embed[] = [
      {
        color: this.colors[level],
        title: `[${config.ENV === 'prod' ? 'PRD' : 'DEV'}] ${message}`,
      },
    ];
    const response = await fetch(config.WEBHOOK_DISCORD, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        embeds,
      }),
    });
    const responseText = await response.text();
    logger.debug(`Success to send discord webhook. ${responseText}`);
  }

  async __sendBody(body: any) {
    if (!body) return;

    const bodyString = jsonStringify(body);
    // const file = new Blob([bodyString], { type: 'text/plain' });
    const file = new Blob([bodyString], { type: 'application/json' });

    // FormData 생성
    const formData = new FormData();
    formData.append('file', file, 'body.json');

    await fetch(config.WEBHOOK_DISCORD, {
      method: 'POST',
      body: formData,
    });
  }
}

export const webhook = new Webhook();
