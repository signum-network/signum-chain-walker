"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = void 0;
function sleep(durationMillies) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMillies);
  });
}
exports.sleep = sleep;
