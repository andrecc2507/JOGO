/** Token que identifica um tipo de componente. O dado em si é um objeto simples (POJO). */
export interface ComponentType<T> {
  readonly name: string;
  /** Campo fantasma usado só para inferência de tipo. */
  readonly __data?: T;
}

export type ComponentData<C> = C extends ComponentType<infer T> ? T : never;

const names = new Set<string>();

export function defineComponent<T>(name: string): ComponentType<T> {
  if (names.has(name)) throw new Error(`Componente duplicado: "${name}"`);
  names.add(name);
  return Object.freeze({ name }) as ComponentType<T>;
}
