export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageBackend {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

export interface SaveFile<T = unknown> {
  version: number;
  savedAt: string;
  data: T;
}

/** Recebe os dados da versão N e devolve na versão N+1. */
export type Migration = (data: any) => any;

/**
 * Persistência versionada. Ao mudar o formato do save, incremente `version`
 * e registre uma migração em `migrations[versãoAntiga]`.
 */
export class SaveService {
  constructor(
    private readonly storage: StorageBackend,
    private readonly version: number,
    private readonly migrations: Record<number, Migration> = {},
    private readonly prefix = 'jogo:save:',
  ) {}

  save<T>(slot: string, data: T): void {
    const file: SaveFile<T> = { version: this.version, savedAt: new Date().toISOString(), data };
    this.storage.setItem(this.prefix + slot, JSON.stringify(file));
  }

  load<T>(slot: string): T | null {
    const raw = this.storage.getItem(this.prefix + slot);
    if (raw === null) return null;
    const file = JSON.parse(raw) as SaveFile;
    let { version, data } = file;
    while (version < this.version) {
      const migrate = this.migrations[version];
      if (!migrate) throw new Error(`Sem migração de save da versão ${version}`);
      data = migrate(data);
      version++;
    }
    if (version > this.version) throw new Error(`Save de versão futura (${version})`);
    return data as T;
  }

  /** Quando o espaço foi salvo (ISO), sem migrar os dados; null se vazio ou ilegível. */
  savedAt(slot: string): string | null {
    const raw = this.storage.getItem(this.prefix + slot);
    if (raw === null) return null;
    try {
      return (JSON.parse(raw) as SaveFile).savedAt;
    } catch {
      return null;
    }
  }

  has(slot: string): boolean {
    return this.storage.getItem(this.prefix + slot) !== null;
  }

  delete(slot: string): void {
    this.storage.removeItem(this.prefix + slot);
  }
}
