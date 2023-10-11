import axios from "axios";
import { IconRepository } from "..";
import { Icon, IconttvIcon } from "../../../models";
import { IconttvResponse } from "../../../models/response";
import { getIconttvUrl } from "../../../utils/iconttv";
import { cloneDeep } from 'lodash';
import logger from '../../../lib/logger';
import { sleep } from '../../../utils';

export class IconFunzinnuRepository implements IconRepository {
  private static _instance: IconFunzinnuRepository;

  private isIconLoading = false;
  private sourceUrl = 'https://api.probius.dev/twitch-icons/cdn/list/funzinnu';
  private iconList: IconttvIcon[] = [];

  static get instance(): IconFunzinnuRepository {
    if (!this._instance) this._instance = new IconFunzinnuRepository();
    return this._instance;
  }

  private async fetchIconList() {
    logger.debug(`Fetch Funzinnu's icon list`);
    const response = await axios.get(this.sourceUrl, {
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-store',
        Expires: '0',
      },
    });
    const jsonData: IconttvResponse = response.data;

    if (!jsonData.icons) throw new Error('Iconttv Server Error!');

    logger.debug(`Fetch Funzinnu's icon list Done`);
    this.iconList = jsonData.icons;
  }

  async findOne(searchKeyword: string): Promise<Icon | null> {
    if (!this.iconList || !this.iconList.length) {
      try {
        while (this.isIconLoading) {
          await sleep(10);
        }

        this.isIconLoading = true;
        await this.fetchIconList();
      } catch (e) {
        logger.error(e);
        return null;
      } finally {
        this.isIconLoading = false;
      }

      return this.findOne(searchKeyword);
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
