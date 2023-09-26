import axios from "axios";
import { IconRepository } from "..";
import { Icon, IconttvIcon } from "../../../models";
import { IconttvResponse } from "../../../models/response";
import { getIconttvUrl } from "../../../utils/iconttv";

export class IconFunzinnuRepository implements IconRepository {
  private static _instance: IconFunzinnuRepository;

  private sourceUrl = "https://api.probius.dev/twitch-icons/cdn/list/funzinnu";
  private iconList: IconttvIcon[] = [];

  static get instance(): IconFunzinnuRepository {
    if (!this._instance) this._instance = new IconFunzinnuRepository();
    return this._instance;
  }

  private async fetchIconList() {
    console.debug(`Fetch Funzinnu's icon list`);
    const response = await axios.get(this.sourceUrl);
    const jsonData: IconttvResponse = response.data;

    if (!jsonData.icons) throw new Error("Iconttv Server Error!");

    return jsonData.icons;
  }

  async findOne(searchKeyword: string): Promise<Icon | null> {
    if (!this.iconList || !this.iconList.length) {
      this.iconList = await this.fetchIconList();
    }

    const matchIcons = this.iconList.filter((icon) =>
      icon.keywords
        .map((keyword) => keyword.toLowerCase())
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
