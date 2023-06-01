export function sleep(durationMillies: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMillies);
  });
}
