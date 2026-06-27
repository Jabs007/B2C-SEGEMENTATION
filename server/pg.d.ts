declare module 'pg' {
  export class Client {
    constructor(config?: any);
    connect(): Promise<void>;
    query(...args: any[]): Promise<any>;
    end(): Promise<void>;
  }
}