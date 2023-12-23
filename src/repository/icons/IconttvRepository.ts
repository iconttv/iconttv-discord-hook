import axios from 'axios';
import { IconRepository } from '.';
import { Icon, IconttvIcon } from '../..//models';
import { IconttvResponse } from '../..//models/response';
import { getIconttvUrl } from '../..//utils/iconttv';
import { cloneDeep } from 'lodash';
import logger from '../..//lib/logger';
import { acquireLock } from '../../utils';

export class IconttvRepository implements IconRepository {
  private isIconLoading = false;
  private iconList: IconttvIcon[] = [];

  _streamerName: string | undefined;

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
  }

  async findOne(searchKeyword: string): Promise<Icon | null> {
    if (!this.iconList || !this.iconList.length) {
      try {
        await acquireLock(() => this.isIconLoading, 2000);
        if (this.iconList && this.iconList.length) {
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
    return cloneDeep(matchIcon);
  }

  imagePathResolver(imagePath: string): string {
    return getIconttvUrl(imagePath);
  }
}
