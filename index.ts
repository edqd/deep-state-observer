import { path, set, view, lensPath } from 'ramda';
import clone from 'fast-copy';
import { scanObject, match, wildcardToRegex } from './wildcard-object-scan';

export type Listener = (value: any, path: string) => {};
export type ListenerAll = (valueOrPath: any, value: any | undefined) => {};
export type Updater = (value: any) => {};

export interface IListeners {
  [key: string]: Listener[];
}

class Store {
  listeners: IListeners;
  data: any;
  options: any;

  constructor(data = {}, options = { delimeter: '.' }) {
    this.listeners = {};
    this.data = data;
    this.options = options;
  }

  getListeners(): IListeners {
    return this.listeners;
  }

  destroy() {
    this.data = undefined;
    this.listeners = {};
  }

  match(first: string, second: string): boolean {
    if (first === second) {
      return true;
    }
    if (this.isWildcard(first)) {
      return match(first, second, this.options.delimeter);
    }
    return false;
  }

  split(path: string) {
    if (path === '') {
      return [];
    }
    return path.split(this.options.delimeter);
  }

  isWildcard(path: string): boolean {
    return path.indexOf('*') > -1;
  }

  subscribeAll(userPaths: string[], fn: ListenerAll) {
    let unsubscribers = [];
    for (const userPath of userPaths) {
      const wrappedSubscriber = (((newValue) => {
        fn(userPath, newValue);
      }) as any) as Listener;
      unsubscribers.push(this.subscribe(userPath, wrappedSubscriber));
    }
    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      unsubscribers = [];
    };
  }

  subscribe(userPath: string, fn: Listener, execute = true) {
    if (typeof userPath === 'function') {
      fn = userPath;
      userPath = '';
    }
    if (!Array.isArray(this.listeners[userPath])) {
      this.listeners[userPath] = [];
    }
    this.listeners[userPath].push(fn);
    const isWildcard = this.isWildcard(userPath);
    if (execute && !isWildcard) {
      fn(path(this.split(userPath), this.data), userPath);
    }
    if (isWildcard) {
      const paths = scanObject(this.data, this.options.delimeter).get(userPath);
      for (const path in paths) {
        fn(paths[path], path);
      }
    }
    return this.unsubscribe(fn);
  }

  unsubscribe(fn: Listener) {
    return () => {
      for (const currentPath in this.listeners) {
        this.listeners[currentPath] = this.listeners[currentPath].filter((current) => current !== fn);
        if (this.listeners[currentPath].length === 0) {
          delete this.listeners[currentPath];
        }
      }
    };
  }

  update(userPath: string, fn: Updater) {
    const lens = lensPath(this.split(userPath));
    let oldValue = clone(view(lens, this.data));
    let newValue;
    if (typeof fn === 'function') {
      newValue = fn(view(lens, this.data));
    } else {
      newValue = fn;
    }
    if (
      (['number', 'string', 'undefined', 'boolean'].includes(typeof newValue) || newValue === null) &&
      oldValue === newValue
    ) {
      return newValue;
    }
    this.data = set(lens, newValue, this.data);
    for (const currentPath in this.listeners) {
      if (this.match(currentPath, userPath)) {
        for (const listener of this.listeners[currentPath]) {
          listener(newValue, userPath);
        }
      }
    }
    return newValue;
  }

  get(userPath: string | undefined = undefined) {
    if (typeof userPath === 'undefined' || userPath === '') {
      return this.data;
    }
    return path(userPath.split('.'), this.data);
  }

  static clone(obj) {
    return clone(obj);
  }
}

export default { scanObject, match, wildcardToRegex, Store };
