const instances: Record<string, object> = {};

export default class Singleton {
  constructor() {
    const instance = instances[this.constructor.name];

    if (instance == null) {
      return (instances[this.constructor.name] = this);
    }

    return instance;
  }
}
