/**
 * Reserve upload slots immediately, then commit batches in selection order.
 *
 * `onPendingChange` reports how many accepted files are still uploading (or
 * waiting to be committed), so the owner can block saves/navigation until the
 * queue is idle.
 */
export function createProjectMediaQueue<T>(
  maximum: number,
  currentCount: () => number,
  read: (file: T) => Promise<string | null>,
  append: (values: string[]) => void,
  onPendingChange?: (pending: number) => void,
) {
  let pending = 0;
  let tail = Promise.resolve();
  const setPending = (next: number) => { pending = next; onPendingChange?.(pending); };
  return async (files: readonly T[]): Promise<boolean> => {
    if (currentCount() + pending + files.length > maximum) return false;
    if (!files.length) return true;
    setPending(pending + files.length);
    const results = Promise.all(files.map(file => read(file).catch(() => null)));
    const commit = tail.then(async () => {
      const values = (await results).filter((value): value is string => value !== null);
      if (values.length) append(values);
    }).finally(() => { setPending(pending - files.length); });
    tail = commit.catch(() => {});
    await commit;
    return true;
  };
}
