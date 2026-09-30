/**
 * Catálogo de domínios de dados (conteúdo do jogo em JSON).
 * Cada domínio é declarado por augmentation, junto do seu tipo:
 *
 *   declare module '@core/data/data_registry' {
 *     interface DataCatalog { actors: ActorDef }
 *   }
 */
export interface DataCatalog {}

export interface DataRecord {
  id: string;
}

export type DataDomain = keyof DataCatalog & string;

/** Registro central de conteúdo data-driven, indexado por domínio e id. */
export class DataRegistry {
  private readonly domains = new Map<string, Map<string, DataRecord>>();

  register<D extends DataDomain>(domain: D, records: readonly DataCatalog[D][]): void {
    let map = this.domains.get(domain);
    if (!map) {
      map = new Map();
      this.domains.set(domain, map);
    }
    for (const record of records as readonly DataRecord[]) {
      if (!record || typeof record.id !== 'string') {
        throw new Error(`Registro sem "id" no domínio "${domain}"`);
      }
      if (map.has(record.id)) throw new Error(`Id duplicado "${record.id}" no domínio "${domain}"`);
      map.set(record.id, record);
    }
  }

  get<D extends DataDomain>(domain: D, id: string): DataCatalog[D] {
    const record = this.domains.get(domain)?.get(id);
    if (!record) throw new Error(`Dado não encontrado: ${domain}/${id}`);
    return record as DataCatalog[D];
  }

  tryGet<D extends DataDomain>(domain: D, id: string): DataCatalog[D] | undefined {
    return this.domains.get(domain)?.get(id) as DataCatalog[D] | undefined;
  }

  all<D extends DataDomain>(domain: D): DataCatalog[D][] {
    return [...(this.domains.get(domain)?.values() ?? [])] as DataCatalog[D][];
  }

  has(domain: string, id: string): boolean {
    return this.domains.get(domain)?.has(id) ?? false;
  }
}
