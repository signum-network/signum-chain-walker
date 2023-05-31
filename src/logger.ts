import pino from "pino";

export function createLogger(isVerbose: boolean) {
  return pino({
    transport: {
      target: "pino-pretty",
    },
    level: isVerbose ? "trace" : "info",
  });
}
