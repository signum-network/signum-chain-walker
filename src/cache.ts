import { readJSON, writeJSON, pathExists } from "fs-extra";

/**
 * @ignore
 */
interface CacheData {
  lastUpdated: string;
  lastProcessedBlock: number;
  lastProcessingError: string;
  unprocessedTxIds: object;
  avgProcessingTime: number;
}

/**
 * @ignore
 */
export class Cache {
  private data: CacheData = {
    lastUpdated: new Date(0).toISOString(),
    lastProcessedBlock: 0,
    lastProcessingError: "",
    unprocessedTxIds: {},
    avgProcessingTime: 0,
  };

  constructor(private filename: string = "") {
    this.initialize();
  }

  private initialize() {
    this.data = {
      lastUpdated: new Date(0).toISOString(),
      lastProcessedBlock: 0,
      lastProcessingError: "",
      unprocessedTxIds: {},
      avgProcessingTime: 0,
    };
  }
  get isMemoryOnly() {
    return !this.filename;
  }

  getLastProcessedBlock() {
    return this.data.lastProcessedBlock;
  }

  getLastProcessingError() {
    return this.data.lastProcessingError;
  }

  getUnprocessedTransactionSet() {
    return new Set<string>(Object.keys(this.data.unprocessedTxIds || {}));
  }

  async read(): Promise<CacheData> {
    if (this.isMemoryOnly) {
      return Promise.resolve(this.data);
    }

    const exists = await pathExists(this.filename);
    if (!exists) {
      await this.reset(true);
    } else {
      this.data = await readJSON(this.filename);
    }
    return this.data;
  }

  update(data: Partial<Omit<CacheData, "lastUpdated" | "avgProcessingTime">>) {
    this.data = {
      ...this.data,
      ...data,
    };
    this.updateDate();
  }

  private updateDate() {
    this.data.lastUpdated = new Date().toISOString();
  }

  async persist() {
    this.updateDate();
    if (this.isMemoryOnly) {
      return;
    }
    await writeJSON(this.filename, this.data, { spaces: "\t" });
  }

  async reset(shouldPersist: boolean) {
    this.initialize();
    if (shouldPersist) {
      await this.persist();
    }
  }
}
