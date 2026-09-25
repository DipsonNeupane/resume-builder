// Minimal ambient declarations for the exact chrome.* surface this extension uses. The
// project intentionally does not depend on @types/chrome (no new package installs for this
// foundation build) — this hand-written subset keeps `tsc` honest about the calls we actually
// make without pulling in a much larger dependency for a handful of methods.
declare namespace chrome {
  namespace runtime {
    const id: string;
    function getURL(path: string): string;
    function sendMessage(message: unknown): Promise<{received?: boolean}>;
    const onMessage: {addListener(listener: (message: any, sender: {id?: string;url?: string}, respond: (response: {received: boolean})=>void)=>boolean): void};
  }
  namespace alarms {
    function create(name: string, info: {delayInMinutes: number}): Promise<void>;
    const onAlarm: {addListener(listener: (alarm: {name: string}) => void): void};
  }
  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      active?: boolean;
      windowId?: number;
    }
    interface QueryInfo {
      active?: boolean;
      currentWindow?: boolean;
    }
    interface CreateProperties {
      active?: boolean;
      url?: string;
    }
    function query(queryInfo: QueryInfo): Promise<Tab[]>;
    function create(createProperties: CreateProperties): Promise<Tab>;
  }
  namespace scripting {
    interface InjectionTarget {
      tabId: number;
    }
    interface ScriptInjection {
      target: InjectionTarget;
      files?: string[];
      func?: (...args: any[]) => unknown;
      args?: unknown[];
    }
    interface InjectionResult<T> {
      result: T;
      frameId: number;
    }
    function executeScript<T = unknown>(injection: ScriptInjection): Promise<Array<InjectionResult<T>>>;
  }
  namespace storage {
    interface StorageArea {
      get(keys: string[] | string | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string[] | string): Promise<void>;
    }
    const local: StorageArea;
    const session: StorageArea;
  }
}
