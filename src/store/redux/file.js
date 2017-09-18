import fs from 'fs-extra';

export default class FileStorageEngine {
  constructor(path) {
    this._path = path;
  }

  async load() {
    if (await fs.exists(this._path)) {
      const jsonState = await fs.readFile(this._path);
      return JSON.parse(jsonState);
    }

    return {};
  }

  async save(state) {
    const jsonState = JSON.stringify(state);
    return await fs.writeFile(this._path, jsonState);
  }
}
