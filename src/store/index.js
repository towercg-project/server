import * as redux from 'redux';
import * as storage from 'redux-storage';

import FileStorageEngine from './redux/file';

const DEFAULT_REDUCER = (state = {}, action) => state;

export async function buildStore(storePath, pluginEntries) {
  const reducer = buildReducer(pluginEntries);

  const engine = new FileStorageEngine(storePath);

  const reducerWrapper = storage.reducer;
  const middleware = storage.createMiddleware(engine);
  const loader = storage.createLoader(engine);

  const storeBuilder = redux.applyMiddleware(middleware)(redux.createStore);
  const store = storeBuilder(reducerWrapper(reducer));

  await loader(store);

  return store;
}

function buildReducer(pluginEntries) {
  const baseReducer = {};

  pluginEntries.forEach((pluginEntry) => {
    const { pluginClass } = pluginEntry;
    console.log(pluginClass)
    const reducer = pluginClass.reducer || DEFAULT_REDUCER;

    baseReducer[pluginClass.pluginName] = reducer;
  });

  return redux.combineReducers(baseReducer);
}
