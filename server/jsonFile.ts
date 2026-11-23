import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
export function jsonFile<T>(name: string, initial: () => T | Promise<T>) {
  const dir = resolve(process.env.DATA_DIR ?? "data"),
    file = resolve(dir, name);
  let queue: Promise<unknown> = Promise.resolve();
  async function read(): Promise<T> {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return initial();
      throw e;
    }
  }
  async function update<R>(fn: (data: T) => R | Promise<R>) {
    const task = queue.then(async () => {
      const data = await read();
      const result = await fn(data);
      await mkdir(dir, { recursive: true });
      await writeFile(file + ".tmp", JSON.stringify(data, null, 2));
      await rename(file + ".tmp", file);
      return result;
    });
    queue = task.catch(() => {});
    return task;
  }
  return {
    read: async () => {
      await queue;
      return read();
    },
    update,
  };
}
