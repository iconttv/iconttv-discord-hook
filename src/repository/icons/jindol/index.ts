import path from "path";
import { IconRepository } from "..";
import { Icon } from "../../../models";
import iconList from "./resource/iconList";
import { cloneDeep } from 'lodash';

export class IconJindolRepository implements IconRepository {
  private static _instance: IconJindolRepository;

  static get instance(): IconJindolRepository {
    if (!this._instance) this._instance = new IconJindolRepository();
    return this._instance;
  }

  async findOne(searchKeyword: string): Promise<Icon | null> {
    const matchIcons = iconList.filter(icon =>
      icon.keywords
        .map(keyword => keyword.toLowerCase())
        .includes(searchKeyword.toLowerCase())
    );

    if (matchIcons.length === 0) return null;

    /**
     * matchIcons[0]을 그냥 리턴하면
     * 해당 객체에 변경이 발생할 수 있음.
     */
    return cloneDeep(matchIcons[0]);
  }

  imagePathResolver(imagePath: string): string {
    return path.join(
      path.resolve(path.join(__dirname, './resource/icon')),
      imagePath
    );
  }
}
