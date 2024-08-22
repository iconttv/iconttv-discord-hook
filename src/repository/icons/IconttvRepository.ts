import axios from 'axios';
import { IconRepository } from './index';
import { Icon, IconttvIcon } from '../../models/index';
import { IconttvResponse } from '../../models/response';
import { getIconttvUrl } from '../../utils/iconttv';
import logger from '../../lib/logger';
import { acquireLock } from '../../utils/index';

// 12 hours
const EXPIRE_TIME = 12 * 60 * 60 * 1000;

export class IconttvRepository implements IconRepository {
  private isIconLoading = false;
  private iconList: IconttvIcon[] = [];
  private fetchedAt: number = 0;

  _streamerName: string | undefined;

  constructor() {
    logger.debug(`IconttvRepository ${this._streamerName} Created`);
  }

  private async fetchIconList() {
    logger.debug(`Fetch ${this._streamerName}'s icon list`);
    const response = await axios.get(
      `https://api.probius.dev/twitch-icons/cdn/list/${this._streamerName}`,
      {
        headers: {
          'Cache-Control': 'no-store',
          Pragma: 'no-store',
          Expires: '0',
        },
      }
    );
    const jsonData: IconttvResponse = response.data;

    if (!jsonData.icons) throw new Error('Iconttv Server Error!');

    logger.debug(`Fetch ${this._streamerName}'s icon list Done`);
    this.iconList = jsonData.icons;
    this.fetchedAt = Date.now();
  }

  async findOne(searchKeyword: string): Promise<Icon | null> {
    const isExpired = Date.now() - this.fetchedAt > EXPIRE_TIME;
    if (isExpired || !this.iconList || !this.iconList.length) {
      try {
        await acquireLock(() => this.isIconLoading, 2000);
        if (this.iconList && this.iconList.length) {
          // 다른 메시지 요청에서 목록을 이미 가져온 경우
          return this.findOne(searchKeyword);
        }

        this.isIconLoading = true;
        await this.fetchIconList();
      } catch (e) {
        logger.error(e);
        return null;
      } finally {
        this.isIconLoading = false;
      }
    }

    const matchIcons = this.iconList.filter(icon =>
      icon.keywords
        .map(keyword => keyword.toLowerCase())
        .includes(searchKeyword.toLowerCase())
    );

    if (matchIcons.length === 0) return null;
    const matchIcon: Icon = {
      keywords: matchIcons[0].keywords,
      imagePath: matchIcons[0].useOrigin
        ? matchIcons[0].originUri
        : matchIcons[0].uri,
      isRemoteImage: true,
    };
    return matchIcon;
  }

  imagePathResolver(imagePath: string): string {
    return getIconttvUrl(imagePath);
  }
}
