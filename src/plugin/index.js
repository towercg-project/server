import * as _ from 'lodash';

import path from 'path';

export class ServerPlugin {
  constructor(pluginConfig, server) {
    const baseLogger = server._logger;
    const eventBus = server.eventBus;
    const store = server.store;
    const paths = server.config.paths;

    this._logger = baseLogger.child({pluginName: this.name});
    this.logger.debug(`${this.name} (${this.constructor.name}) constructed.`);

    this._pluginConfig = _.merge({}, this.constructor.defaultConfig || {}, pluginConfig);
    this._eventBus = eventBus;
    this._dispatch = store.dispatch;

    this._commands = {};

    this.emit = (baseType, args) => {
      const type = `${this.name}.${baseType}`;
      this.logger.trace("Emitting event through plugin interface:", type)
      this._eventBus.emit(type, args);
    };

    this.on = (baseType, listener) => {
      const type = `${this.name}.${baseType}`;
      this.logger.trace("Listening through plugin interface:", type)
      this.eventBus.on(type, listener)
    };

    this.computeStoragePath = (childPath) => path.join(paths.storage, childPath);
    this.computeCachePath = (childPath) => path.join(paths.cache, childPath);

    this._storeState = store.getState()[this.name];
    this._state = _.cloneDeep(this._storeState);

    store.subscribe(() => {
      const pluginState = store.getState()[this.name];
      if (this._storeState !== pluginState) {
        this._storeState = pluginState;

        const oldState = this._state;
        const newState = this._state = _.cloneDeep(this._storeState);

        this.emit("stateChanged", { oldState, newState });
      }
    });
  }

  get name() { return this.constructor.pluginName; }
  get commandNames() { return this._commandNames; }
  get pluginConfig() { return this._pluginConfig; }
  get logger() { return this._logger; }
  get eventBus() { return this._eventBus; }
  get dispatch() { return this._dispatch; }

  async doInitialize() {
    this.logger.debug("Initializing.");

    await this.initialize();
    this.logger.debug("Initialized.");
  }

  doCommand(name, data) {
    if (!name.startsWith(`${this.name}.`)) {
      return undefined;
    }

    const localName = name.replace(`${this.name}.`, "");
    const fn = this._commands[localName];
    if (fn) {
      const ret = fn(data);

      if (ret === undefined) {
        this.logger.warn(`Command '${localName}' tried to return undefined. Returning null instead.`);

        ret = null;
      }

      if (typeof(ret) !== 'object') {
        this.logger.warn(`Command '${localName}' tried to return a non-object. Wrapping with key 'result'.`);

        ret = { result: ret };
      }

      return ret;
    } else {
      return undefined;
    }
  }

  registerCommand(name, fn) {
    if (this._commands[name]) {
      this.logger.warn(`Re-defining command '${name}'.`);
    }

    this._commands[name] = fn;
    this._commandNames = Object.keys(this._commands);
  }

  initialize() {
    throw new Error(`${this.constructor.name} needs to implement initialize().`);
  }
}
