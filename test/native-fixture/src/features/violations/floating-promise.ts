async function sync(): Promise<number> {
  return await Promise.resolve(1);
}

export function start(): void {
  sync();
}
