import logger from '../lib/logger';

const instances: Record<string, object> = {};

export default class Singleton {
  constructor() {
    const instance = instances[this.constructor.name];

    if (!instance) {
      logger.debug(`Singleton ${this.constructor.name} created`);
      return (instances[this.constructor.name] = this);
    }

    logger.debug(`Singleton ${this.constructor.name} reused`);
    return instance;
  }
}
