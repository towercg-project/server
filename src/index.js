export { Config } from './config';
export { ServerPlugin } from './plugin';

import * as RH from './store/redux/reducers';
export const ReducerHelpers = RH;

import Server from './server';

export function start(config) {
  const server = new Server(config);

  server.start();
}
