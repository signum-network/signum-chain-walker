/**
 * @ignore
 */
export function pCall(fn: Function, ...args: any[]) {
  if (typeof fn !== "function") {
    throw new Error("Expected a function!");
  }

  if (
    fn.constructor.name === "Promise" ||
    fn.constructor.name === "AsyncFunction"
  ) {
    return fn(...args);
  }
  return new Promise((resolve, reject) => {
    try {
      resolve(fn(...args));
    } catch (e) {
      reject(e);
    }
  });
}
