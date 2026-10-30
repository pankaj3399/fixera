/** Reserve upload slots immediately, then commit batches in selection order. */
export function createProjectMediaQueue<T>(
  maximum: number,
  currentCount: () => number,
  read: (file: T) => Promise<string | null>,
  append: (values: string[]) => void,
) {
  let pending = 0;
  let tail = Promise.resolve();
  return async (files: readonly T[]): Promise<boolean> => {
    if (currentCount() + pending + files.length > maximum) return false;
    pending += files.length;
    const results = Promise.all(files.map(file => read(file).catch(() => null)));
    const commit = tail.then(async () => {
      const values = (await results).filter((value): value is string => value !== null);
      if (values.length) append(values);
    }).finally(() => { pending -= files.length; });
    tail = commit.catch(() => {});
    await commit;
    return true;
  };
}
