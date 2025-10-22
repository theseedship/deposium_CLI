/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'conf' {
  export default class Conf<T = any> {
    constructor(options?: {
      projectName?: string;
      configName?: string;
      cwd?: string;
      [key: string]: any;
    });
    get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K] | undefined;
    set<K extends keyof T>(key: K, value: T[K]): void;
    delete<K extends keyof T>(key: K): void;
    clear(): void;
    readonly path: string;
  }
}
/* eslint-enable no-unused-vars */
/* eslint-enable @typescript-eslint/no-explicit-any */
