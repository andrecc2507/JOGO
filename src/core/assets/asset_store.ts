export type AssetKind = 'image' | 'audio' | 'json';

export interface AssetEntry {
  key: string;
  kind: AssetKind;
  /** Caminho relativo a /public (ex.: "assets/sprites/hero.png"). */
  src: string;
}

type AssetValue = HTMLImageElement | HTMLAudioElement | unknown;

/** Carregamento e cache de assets. Carregue em lote na cena de boot; depois só `get`. */
export class AssetStore {
  private readonly cache = new Map<string, AssetValue>();

  async loadAll(entries: readonly AssetEntry[], onProgress?: (done: number, total: number) => void): Promise<void> {
    let done = 0;
    await Promise.all(
      entries.map(async (entry) => {
        this.cache.set(entry.key, await this.load(entry));
        onProgress?.(++done, entries.length);
      }),
    );
  }

  get<T = AssetValue>(key: string): T {
    if (!this.cache.has(key)) throw new Error(`Asset não carregado: "${key}"`);
    return this.cache.get(key) as T;
  }

  image(key: string): HTMLImageElement {
    return this.get<HTMLImageElement>(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  private load(entry: AssetEntry): Promise<AssetValue> {
    const url = `${import.meta.env.BASE_URL}${entry.src}`;
    switch (entry.kind) {
      case 'image':
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Falha ao carregar imagem ${url}`));
          img.src = url;
        });
      case 'audio':
        return new Promise((resolve, reject) => {
          const audio = new Audio();
          audio.oncanplaythrough = () => resolve(audio);
          audio.onerror = () => reject(new Error(`Falha ao carregar áudio ${url}`));
          audio.src = url;
        });
      case 'json':
        return fetch(url).then((r) => r.json());
    }
  }
}
