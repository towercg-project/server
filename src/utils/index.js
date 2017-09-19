export function funcify(obj, arg) {
  if (typeof(obj) === 'function') {
    return obj(arg);
  }

  return obj;
}
