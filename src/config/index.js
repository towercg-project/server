import fs from 'fs';
import path from 'path';

import autobind from 'auto-bind';
import PrettyStream from 'bunyan-prettystream';

export class Config {
  static DEFAULT_AUTH_FUNCTION = (cfg, username, password) => true;
  static DEFAULT_LOG_FUNCTION = (cfg) => {
    const prettyOutput = new PrettyStream();
    prettyOutput.pipe(process.stderr);

    return {
      name: "towercg",
      level: "debug",
      streams: [
        {
          level: process.env.TOWERCG_CONSOLE_LOG_LEVEL || "debug",
          stream: prettyOutput
        },
        {
          level: process.env.TOWERCG_FILE_LOG_LEVEL || "debug",
          path: process.env.TOWERCG_LOG_FILE || path.join(cfg.appRoot, "towercg.log")
        }
      ]
    };
  };

  constructor(appRoot) {
    autobind(this);

    this.appRoot = path.normalize(appRoot);

    const packageJsonPath = path.join(this.appRoot, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`Couldn't find package.json at: ${packageJsonPath}`);
    }

    this.packageJson = JSON.parse(fs.readFileSync(packageJsonPath));

    this.logging = {
      builder: Config.DEFAULT_LOG_FUNCTION
    };
    this.http = {
      port: 14400
    };

    this.paths = {
      storage: path.join(this.appRoot, "storage"),
      cache: path.join(this.appRoot, "cache")
    };

    this.exitOnUnhandledRejections = false;

    this.authFunction = Config.DEFAULT_AUTH_FUNCTION;
    this.plugins = [];
  }

  registerPlugin(pluginClass, pluginConfig = {}) {
    if (this.plugins.some((e) => e.pluginClass === pluginClass)) {
      throw new Error(`Duplicate plugin registration: ${pluginClass}`);
    }

    this.plugins.push({ pluginClass, pluginConfig });

    return this;
  }
}
