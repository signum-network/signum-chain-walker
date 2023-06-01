"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimestamp = void 0;
const pad = (n) => (n < 10 ? "0" + n : n);
const getTimestamp = () => {
  const d = new Date();
  return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds()
  )}.${d.getMilliseconds()}]`;
};
exports.getTimestamp = getTimestamp;
