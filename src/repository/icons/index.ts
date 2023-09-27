/* eslint-disable @typescript-eslint/no-unused-vars */
import { Icon } from '../../models';

export abstract class IconRepository {
  private static _instance: IconRepository;

  static get instance(): IconRepository {
    throw 'not implemented';
  }

  /**
   * 매칭되는 아이콘 리턴.
   * 이미지 주소는 처리하지 않은 그대로의 것을 리턴한다.
   * @param searchKeyword
   */
  async findOne(searchKeyword: string): Promise<Icon | null> {
    throw 'not implemented';
  }

  /**
   * `findOne` 메소드로 찾은 아이콘의 이미지 주소를
   * 외부에서 사용할 수 있도록 변환해주는 함수
   * @param imagePath
   */
  imagePathResolver(imagePath: string): string {
    throw 'not implemented';
  }
}
