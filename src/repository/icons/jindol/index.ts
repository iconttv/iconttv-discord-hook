import path from "path";
import { IconRepository } from "..";
import { Icon } from "../../../models";
import iconList from "./resource/iconList";

export class IconJindolRepository implements IconRepository {
  private static _instance: IconJindolRepository;

  static get instance(): IconJindolRepository {
    if (!this._instance) this._instance = new IconJindolRepository();
    return this._instance;
  }

  async findOne(searchKeyword: string): Promise<Icon | null> {
    const matchIcons = iconList.filter((icon) =>
      icon.keywords
        .map((keyword) => keyword.toLowerCase())
        .includes(searchKeyword.toLowerCase())
    );

    if (matchIcons.length === 0) return null;
    return matchIcons[0];
  }

  imagePathResolver(imagePath: string): string {
    return path.join(
      path.resolve(path.join(__dirname, "./resource/icon")),
      imagePath
    );
  }
}
