declare module 'conf' {
  interface ConfOptions<T> {
    projectName?: string;
    configName?: string;
    cwd?: string;
    defaults?: Partial<T>;
    schema?: Record<string, unknown>;
    migrations?: Record<string, (store: Conf<T>) => void>;
    beforeEachMigration?: (
      store: Conf<T>,
      context: { fromVersion: string; toVersion: string; finalVersion: string; versions: string[] }
    ) => void;
    projectVersion?: string;
    clearInvalidConfig?: boolean;
    accessPropertiesByDotNotation?: boolean;
    watch?: boolean;
    configFileMode?: number;
    encryptionKey?: string | Buffer | NodeJS.TypedArray | DataView;
    fileExtension?: string;
    serialize?: (value: T) => string;
    deserialize?: (text: string) => T;
  }

  export default class Conf<T = Record<string, unknown>> {
    constructor(options?: ConfOptions<T>);
    get<K extends keyof T>(key: K): T[K] | undefined;
    get<K extends keyof T>(key: K, defaultValue: T[K]): T[K];
    set<K extends keyof T>(key: K, value: T[K]): void;
    set(object: Partial<T>): void;
    delete<K extends keyof T>(key: K): void;
    clear(): void;
    has<K extends keyof T>(key: K): boolean;
    readonly path: string;
    readonly size: number;
    readonly store: T;
  }
}
