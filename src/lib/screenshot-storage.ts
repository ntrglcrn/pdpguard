import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const SCREENSHOT_TTL_MS = 24 * 60 * 60 * 1_000;
const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ScreenshotStorage {
  save(contents: Buffer): Promise<{ id: string; url: string }>;
  read(id: string): Promise<Buffer | null>;
}

export class LocalScreenshotStorage implements ScreenshotStorage {
  constructor(
    private readonly directory = path.join(
      process.cwd(),
      ".runtime",
      "screenshots",
    ),
  ) {}

  async save(contents: Buffer) {
    await mkdir(this.directory, { recursive: true });
    await this.cleanupExpired();
    const id = randomUUID();
    await writeFile(this.filePath(id), contents, { flag: "wx", mode: 0o600 });
    return { id, url: `/api/screenshots/${id}` };
  }

  async read(id: string): Promise<Buffer | null> {
    if (!ID_PATTERN.test(id)) return null;
    try {
      return await readFile(this.filePath(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private filePath(id: string) {
    return path.join(this.directory, `${id}.png`);
  }

  private async cleanupExpired() {
    const cutoff = Date.now() - SCREENSHOT_TTL_MS;
    for (const name of await readdir(this.directory)) {
      if (!name.endsWith(".png")) continue;
      const file = path.join(this.directory, name);
      try {
        if ((await stat(file)).mtimeMs < cutoff) await unlink(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

export const screenshotStorage = new LocalScreenshotStorage();
