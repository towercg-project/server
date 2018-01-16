import * as _ from 'lodash';

import autobind from 'auto-bind';
import bunyan from 'bunyan';
import express from 'express';
import http from 'http';
import io from 'socket.io';
import fsx from 'fs-extra';
import path from 'path';
import jsondiffpatch from 'jsondiffpatch';
import EventEmitter2 from 'eventemitter2';
import listExpressEndpoints from 'express-list-endpoints'

import { buildStore } from '../store';

const jdp = jsondiffpatch.create();
const NON_REBROADCASTED_NAMES = {
  "towercg-client.command": true
};
const NON_CLIENTPUSHED_NAMES = {
  "towercg.stateChanged": true
};

export default class Server {
  constructor(config) {
    autobind(this);

    this.config = _.cloneDeep(config);
    this._logger = bunyan.createLogger(this.config.logging.builder(this.config));

    this.logger.debug("-- LOG START --");
    process.on('exit', (exitCode) => {
      this.logger.child({ exitCode }).info(`Exiting with code ${exitCode}.`);
    });
    process.on('unhandledRejection', (r) => {
      this.logger.error(r);
      if (this.config.exitOnUnhandledRejections) {
        this.logger.error("Exiting because of unhandled rejection.");
        process.exit(1);
      }
    });

    this.logger.debug("Server constructed.");
  }

  get logger() { return this._logger; }
  get plugins() { return this._plugins };
  get store() { return this._store; }
  get eventBus() { return this._eventBus; }

  async start() {
    this.logger.info("Starting server.");

    this._eventBus = this._constructEventBus();
    this._ensurePaths();
    this._store = await this._constructStore();
    this._plugins = this._constructPlugins();

    await this._initializePlugins();
    this._httpServer = this._constructHttpServer();
    this._io = this._constructSocketIO();
    this._finishStarting();

    this.logger.info("Server startup completed.");
  }

  _constructEventBus() {
    const bus = new EventEmitter2();

    if (this.config.logging.logAllEvents) {
      bus.onAny((eventName, data) => {
        this.logger.debug(">> EVENT", eventName, data);
      });
    }

    return bus;
  }

  _ensurePaths() {
    fsx.mkdirsSync(this.config.paths.storage);
    fsx.mkdirsSync(this.config.paths.cache);
  }

  async _constructStore() {
    const storePath = path.join(this.config.paths.storage, "redux.json");

    this.logger.debug("Initializing Redux to store path", storePath);
    const store = await buildStore(storePath, this.config.plugins);

    this._currentState = store.getState();
    store.subscribe(() => {
      const oldState = this._currentState;
      const newState = this._currentState = store.getState();

      this.eventBus.emit("towercg.stateChanged", { oldState, newState });
    })

    return store;
  }

  _constructPlugins() {
    this.logger.debug("Constructing plugins.");
    const ret = this.config.plugins.map((pluginEntry) => {
      const {pluginClass, pluginConfig} = pluginEntry;

      this.logger.debug(`Initializing '${pluginClass.pluginName}' (${pluginClass.name}).`);
      return new pluginClass(
        pluginConfig,
        this
      );
    });

    this.logger.debug(`${ret.length} plugins constructed.`);
    return ret;
  }

  async _initializePlugins() {
    this.logger.debug("Initializing plugins.");

    for (let plugin of this.plugins) {
      await plugin.doInitialize();
    }

    this.logger.info("All plugins initialized.");
    this.eventBus.emit("global.allPluginsInitialized");
  }

  _constructHttpServer() {
    const app = express();

    app.get('/', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({ ok: true }));
    });

    for (let plugin of this.plugins) {
      const router = express.Router();

      plugin.registerHttpHandlers(router);

      app.use(`/${plugin.name}`, router);
    }

    const endpoints = listExpressEndpoints(app);

    const server = http.Server(app);
    return server;
  }

  _constructSocketIO() {
    const ioServer = io(this._httpServer);

    ioServer.on('connection', (socket) => {
      this._initializeSocket(socket);

      socket.logger.info("Sending initial state to client.");
      socket.emit("towercg.state", this._currentState);
    });

    this.eventBus.on("towercg.stateChanged", (event) => {
      const {oldState, newState} = event;

      const diff = jdp.diff(oldState, newState);

      if (diff) { // redux-storage creates non-changing events; JDP returns undefined.
        this.sendToAuthenticatedClients("towercg.stateChanged", diff);
      }
    });

    // this.eventBus.onAny((eventName, value) => {
    //   if (!NON_CLIENTPUSHED_NAMES[eventName]) {
    //     this.sendToAuthenticatedClients(eventName, value);
    //   }
    // });

    return ioServer;
  }

  _finishStarting() {
    const port = this.config.http.port;
    this.logger.info("Starting HTTP server.");

    this._httpServer.listen(port);
    this.logger.info(`HTTP server started on port ${port}.`);
  }

  sendToAllClients(name, data) {
    this._io.sockets.emit(name, data);
  }

  sendToAuthenticatedClients(name, data) {
    Object.values(this._io.sockets.connected).filter((s) => s.authenticated).forEach((socket) => {
      if (socket.authenticated) {
        socket.emit(name, data);
      }
    });
  }

  _initializeSocket(socket) {
    socket.logger = this.logger.child({ socketId: socket.id });
    socket.logger.debug("Initializing socket.");

    const onevent = socket.onevent;
    socket.onevent = (packet) => {
      const args = packet.data || [];
      this.config.logging.logPackets && socket.logger.trace(packet);
      onevent.call(socket, packet);
      this.eventBus.emit(packet[0], packet[1]);
    }

    // TODO: eventually we probably want a login here.
    socket.authenticated = true;

    socket.on('towercg-client.command', (event) => {
      const {name, id, data} = event;

      if (socket.authenticated) {
        const replyName = `reply.${id}`;
        socket.logger.debug("Command:", name, id, data);

        try {
          let ok = false;

          for (let plugin of this.plugins) {
            const ret = plugin.doCommand(name, data);

            if (ret !== undefined) {
              ok = true;
              socket.emit(replyName, ret);
              break;
            }
          }

          if (!ok) {
            socket.logger.warn("Unrecognized command:", name);
            throw new Error("Unrecognized command.");
          }
        } catch (error) {
          socket.logger.error("Error from command:", name, data);
          socket.logger.error(error);
          socket.emit(replyName, { error });
        }
      }
    });

    socket.on('*', (packet) => {
      const [name, data] = packet;

      if (socket.authenticated) {
        if (!NON_REBROADCASTED_NAMES[name]) {
          this.eventBus.emit(name, data);
        }
      }
    });
  }
}
