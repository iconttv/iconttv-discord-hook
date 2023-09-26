import { Icon } from "../../models";

export abstract class IconRepository {
  private static _instance: IconRepository;

  static get instance(): IconRepository {
    throw "not implemented";
  }

  async findOne(searchKeyword: string): Promise<Icon | null> {
    throw "not implemented";
  }

  imagePathResolver(imagePath: string): string {
    throw "not implemented";
  }
}
