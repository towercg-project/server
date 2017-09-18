export { Config } from './config';
export { ServerPlugin } from './plugin';

import Server from './server';

export function start(config) {
  const server = new Server(config);

  server.start();
}
