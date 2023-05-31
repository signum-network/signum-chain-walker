import { readJSON, writeJSON, pathExists } from "fs-extra";
interface CacheData {
  lastUpdated: string;
  lastSuccessfullyProcessedBlock: number;
  lastProcessingError: string;
  unprocessedTxIds: object;
  avgProcessingTime: number;
}

export class Cache {
  private data: CacheData;

  constructor(private filename: string, private inMemoryOnly = false) {}

  getLastProcessedBlock() {
    return this.data.lastSuccessfullyProcessedBlock;
  }

  getLastProcessingError() {
    return this.data.lastProcessingError;
  }

  getUnprocessedTransactionSet() {
    return new Set<string>(Object.keys(this.data.unprocessedTxIds));
  }

  async read(): Promise<Cache> {
    if (this.inMemoryOnly && !this.data) {
      this.data = {
        lastUpdated: new Date(0).toISOString(),
        lastSuccessfullyProcessedBlock: 0,
        lastProcessingError: "",
        unprocessedTxIds: {},
        avgProcessingTime: 0,
      };
      return this;
    }

    const exists = await pathExists(this.filename);
    if (!exists) {
      this.data = {
        lastUpdated: new Date(0).toISOString(),
        lastSuccessfullyProcessedBlock: 0,
        lastProcessingError: "",
        unprocessedTxIds: {},
        avgProcessingTime: 0,
      };
      await this.persist();
    } else {
      this.data = await readJSON(this.filename);
    }
    return this;
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
    if (!this.inMemoryOnly) {
      await writeJSON(this.filename, this.data);
    }
  }
}
