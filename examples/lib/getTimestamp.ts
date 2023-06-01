const pad = (n: number) => (n < 10 ? "0" + n : n);

export const getTimestamp = () => {
  const d = new Date();
  return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds()
  )}.${d.getMilliseconds()}]`;
};
