import wildcard, { wildcardApi } from './wildcard-object-scan';
import Path from './ObjectPath';

export interface PathInfo {
  listener: string;
  update: string | undefined;
  resolved: string | undefined;
}

export interface ListenerFunctionEventInfo {
  type: string;
  path: PathInfo;
  params: Params;
  options: ListenerOptions | UpdateOptions | undefined;
}

export type ListenerFunction = (value: any, eventInfo: ListenerFunctionEventInfo) => {};
export type Match = (path: string) => boolean;

export interface Options {
  delimeter: string;
  notRecursive: string;
  param: string;
  wildcard: string;
  log: (message: string, info: any) => void;
}

export interface ListenerOptions {
  bulk: boolean;
  debug: boolean;
  source: string;
  data: any;
}

export interface Listener {
  fn: ListenerFunction;
  options: ListenerOptions;
}

export interface GroupedListener {
  listener: Listener;
  listenersCollection: ListenersCollection;
  eventInfo: ListenerFunctionEventInfo;
  value: any;
}

export interface GroupedListenerContainer {
  single: GroupedListener[];
  bulk: GroupedListener[];
}

export interface GroupedListeners {
  [path: string]: GroupedListenerContainer;
}

export type Updater = (value: any) => {};

export interface ListenersObject {
  [key: string]: Listener;
  [key: number]: Listener;
}

export interface ListenersCollection {
  path: string;
  listeners: ListenersObject;
  isWildcard: boolean;
  isRecursive: boolean;
  hasParams: boolean;
  paramsInfo: ParamsInfo | undefined;
  match: Match;
}

export interface Listeners {
  [path: string]: ListenersCollection;
}

export interface ParamInfo {
  name: string;
  replaced: string;
  original: string;
}

export interface Parameters {
  [part: number]: ParamInfo;
}

export interface Params {
  [key: string]: any;
}

export interface ParamsInfo {
  params: Parameters;
  replaced: string;
  original: string;
}

export interface UpdateOptions {
  only: string[];
  source: string;
  debug: boolean;
  data: any;
}

export const WildcardObject = wildcard.WildcardObject;
export const match = wildcard.match;

function log(message: string, info: any) {
  console.debug(message, info);
}

const defaultOptions: Options = { delimeter: `.`, notRecursive: `;`, param: `:`, wildcard: `*`, log };
const defaultListenerOptions: ListenerOptions = { bulk: false, debug: false, source: '', data: undefined };
const defaultUpdateOptions: UpdateOptions = { only: [], source: '', debug: false, data: undefined };

export default class DeepState {
  private listeners: Listeners;
  private data: any;
  public options: any;
  private id: number;
  public pathGet: (path: string[], obj) => {};
  public pathSet: (path: string[], value, obj) => void;
  private scan: wildcardApi;

  constructor(data = {}, options: Options = defaultOptions) {
    this.listeners = {};
    this.data = data;
    this.options = { ...defaultOptions, ...options };
    this.id = 0;
    this.pathGet = Path.get;
    this.pathSet = Path.set;
    this.scan = new WildcardObject(this.data, this.options.delimeter, this.options.wildcard);
  }

  public getListeners(): Listeners {
    return this.listeners;
  }

  public destroy() {
    this.data = undefined;
    this.listeners = {};
  }

  public match(first: string, second: string): boolean {
    if (first === second) {
      return true;
    }
    return this.isWildcard(first) ? match(first, second) : false;
  }

  private cutPath(longer: string, shorter: string): string {
    return this.split(this.cleanNotRecursivePath(longer))
      .slice(0, this.split(this.cleanNotRecursivePath(shorter)).length)
      .join(this.options.delimeter);
  }

  private trimPath(path: string): string {
    return this.cleanNotRecursivePath(path).replace(new RegExp(`^\\${this.options.delimeter}{1}`), ``);
  }

  public split(path: string) {
    return path === `` ? [] : path.split(this.options.delimeter);
  }

  private isWildcard(path: string): boolean {
    return path.includes(this.options.wildcard);
  }

  private isNotRecursive(path: string): boolean {
    return path.endsWith(this.options.notRecursive);
  }

  private cleanNotRecursivePath(path: string): string {
    return this.isNotRecursive(path) ? path.slice(0, -this.options.notRecursive.length) : path;
  }

  private hasParams(path: string) {
    return path.includes(this.options.param);
  }

  private getParamsInfo(path: string): ParamsInfo {
    let paramsInfo: ParamsInfo = { replaced: '', original: path, params: {} };
    let partIndex = 0;
    let fullReplaced = [];
    for (const part of this.split(path)) {
      paramsInfo.params[partIndex] = {
        original: part,
        replaced: '',
        name: ''
      };
      const reg = new RegExp(`\\${this.options.param}([^\\${this.options.delimeter}\\${this.options.param}]+)`, 'g');
      let param = reg.exec(part);
      if (param) {
        paramsInfo.params[partIndex].name = param[1];
      } else {
        delete paramsInfo.params[partIndex];
        fullReplaced.push(part);
        partIndex++;
        continue;
      }
      reg.lastIndex = 0;
      paramsInfo.params[partIndex].replaced = part.replace(reg, '*');
      fullReplaced.push(paramsInfo.params[partIndex].replaced);
      partIndex++;
    }
    paramsInfo.replaced = fullReplaced.join(this.options.delimeter);
    return paramsInfo;
  }

  private getParams(paramsInfo: ParamsInfo | undefined, path: string): Params {
    if (!paramsInfo) {
      return undefined;
    }
    const split = this.split(path);
    const result = {};
    for (const partIndex in paramsInfo.params) {
      const param = paramsInfo.params[partIndex];
      result[param.name] = split[partIndex];
    }
    return result;
  }

  public subscribeAll(userPaths: string[], fn: ListenerFunction, options: ListenerOptions = defaultListenerOptions) {
    let unsubscribers = [];
    for (const userPath of userPaths) {
      unsubscribers.push(this.subscribe(userPath, fn, options));
    }
    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      unsubscribers = [];
    };
  }

  private getCleanListenersCollection(values = {}): ListenersCollection {
    return {
      ...{
        listeners: {},
        isRecursive: false,
        isWildcard: false,
        hasParams: false,
        match: undefined,
        paramsInfo: undefined,
        path: undefined
      },
      ...values
    };
  }

  private getCleanListener(fn: ListenerFunction, options: ListenerOptions = defaultListenerOptions): Listener {
    return {
      fn,
      options: { ...defaultListenerOptions, ...options }
    };
  }

  private getListenerCollectionMatch(listenerPath: string, isRecursive: boolean, isWildcard: boolean) {
    return (path) => {
      let result = false;
      if (isRecursive) {
        path = this.cutPath(path, listenerPath);
      }
      if (isWildcard && wildcard.match(listenerPath, path)) {
        result = true;
      } else {
        result = listenerPath === path;
      }
      return result;
    };
  }

  private getListenersCollection(listenerPath: string, listener: Listener): ListenersCollection {
    let collCfg = {
      isRecursive: true,
      isWildcard: false,
      hasParams: false,
      paramsInfo: undefined,
      originalPath: listenerPath,
      path: listenerPath
    };
    if (this.hasParams(collCfg.path)) {
      collCfg.paramsInfo = this.getParamsInfo(collCfg.path);
      collCfg.path = collCfg.paramsInfo.replaced;
      collCfg.hasParams = true;
    }
    collCfg.isWildcard = this.isWildcard(collCfg.path);
    if (this.isNotRecursive(collCfg.path)) {
      collCfg.path = this.cleanNotRecursivePath(collCfg.path);
      collCfg.isRecursive = false;
    }
    let listenersCollection;
    if (typeof this.listeners[collCfg.path] === 'undefined') {
      listenersCollection = this.listeners[collCfg.path] = this.getCleanListenersCollection({
        ...collCfg,
        match: this.getListenerCollectionMatch(collCfg.path, collCfg.isRecursive, collCfg.isWildcard)
      });
    } else {
      listenersCollection = this.listeners[collCfg.path];
    }
    this.id++;
    listenersCollection.listeners[this.id] = listener;
    return listenersCollection;
  }

  public subscribe(
    listenerPath: string,
    fn: ListenerFunction,
    options: ListenerOptions = defaultListenerOptions,
    type: string = 'subscribe'
  ) {
    let listener = this.getCleanListener(fn, options);
    const listenersCollection = this.getListenersCollection(listenerPath, listener);
    listenerPath = listenersCollection.path;
    if (!listenersCollection.isWildcard) {
      fn(this.pathGet(this.split(listenerPath), this.data), {
        type,
        path: {
          listener: listenerPath,
          update: undefined,
          resolved: listenerPath
        },
        params: this.getParams(listenersCollection.paramsInfo, listenerPath),
        options
      });
    } else {
      const paths = this.scan.get(listenerPath);
      if (options.bulk) {
        const bulkValue = [];
        for (const path in paths) {
          bulkValue.push({
            path,
            params: this.getParams(listenersCollection.paramsInfo, path),
            value: paths[path]
          });
        }
        fn(bulkValue, {
          type,
          path: {
            listener: listenerPath,
            update: undefined,
            resolved: undefined
          },
          options,
          params: undefined
        });
      } else {
        for (const path in paths) {
          fn(paths[path], {
            type,
            path: {
              listener: listenerPath,
              update: undefined,
              resolved: path
            },
            params: this.getParams(listenersCollection.paramsInfo, path),
            options
          });
        }
      }
    }
    this.debugSubscribe(listener, listenersCollection, listenerPath);
    return this.unsubscribe(listenerPath, this.id);
  }

  private empty(obj) {
    for (const key in obj) {
      return false;
    }
    return true;
  }

  private unsubscribe(path: string, id: number) {
    return () => {
      delete this.listeners[path].listeners[id];
      if (this.empty(this.listeners[path].listeners)) {
        delete this.listeners[path];
      }
    };
  }

  private same(newValue, oldValue): boolean {
    return (
      (['number', 'string', 'undefined', 'boolean'].includes(typeof newValue) || newValue === null) &&
      oldValue === newValue
    );
  }

  private notifyListeners(
    listeners: GroupedListeners,
    exclude: GroupedListener[] = [],
    returnNotified: boolean = true
  ): GroupedListener[] {
    const alreadyNotified = [];
    for (const path in listeners) {
      const { single, bulk } = listeners[path];
      for (const singleListener of single) {
        if (exclude.includes(singleListener)) {
          continue;
        }
        const time = this.debugTime(singleListener);
        singleListener.listener.fn(singleListener.value(), singleListener.eventInfo);
        returnNotified && alreadyNotified.push(singleListener);
        this.debugListener(time, singleListener);
      }
      for (const bulkListener of bulk) {
        if (exclude.includes(bulkListener)) {
          continue;
        }
        const time = this.debugTime(bulkListener);
        const bulkValue = bulkListener.value.map((bulk) => ({ ...bulk, value: bulk.value() }));
        bulkListener.listener.fn(bulkValue, bulkListener.eventInfo);
        returnNotified && alreadyNotified.push(bulkListener);
        this.debugListener(time, bulkListener);
      }
    }
    return alreadyNotified;
  }

  private getSubscribedListeners(
    updatePath: string,
    newValue,
    options: UpdateOptions,
    type: string = 'update',
    originalPath: string = null
  ): GroupedListeners {
    options = { ...defaultUpdateOptions, ...options };
    const listeners = {};
    for (let listenerPath in this.listeners) {
      const listenersCollection = this.listeners[listenerPath];
      listeners[listenerPath] = { single: [], bulk: [], bulkData: [] };
      if (listenersCollection.match(updatePath)) {
        const params = listenersCollection.paramsInfo
          ? this.getParams(listenersCollection.paramsInfo, updatePath)
          : undefined;
        const value =
          listenersCollection.isRecursive || listenersCollection.isWildcard
            ? () => this.get(this.cutPath(updatePath, listenerPath))
            : () => newValue;
        const bulkValue = [{ value, path: updatePath, params }];
        for (const listenerId in listenersCollection.listeners) {
          const listener = listenersCollection.listeners[listenerId];
          const eventInfo = {
            type,
            path: {
              listener: listenerPath,
              update: originalPath ? originalPath : updatePath,
              resolved: undefined
            },
            params,
            options
          };
          if (listener.options.bulk) {
            listeners[listenerPath].bulk.push({ listener, listenersCollection, eventInfo, value: bulkValue });
          } else {
            listeners[listenerPath].single.push({
              listener,
              listenersCollection,
              eventInfo: { ...eventInfo, path: { ...eventInfo.path, resolved: updatePath } },
              value
            });
          }
        }
      }
    }
    return listeners;
  }

  private notifySubscribedListeners(
    updatePath: string,
    newValue,
    options: UpdateOptions,
    type: string = 'update',
    originalPath: string = null
  ): GroupedListener[] {
    return this.notifyListeners(this.getSubscribedListeners(updatePath, newValue, options, type, originalPath));
  }

  private getNestedListeners(
    updatePath: string,
    newValue,
    options: UpdateOptions,
    type: string = 'update',
    originalPath: string = null
  ): GroupedListeners {
    const listeners: GroupedListeners = {};
    for (let listenerPath in this.listeners) {
      listeners[listenerPath] = { single: [], bulk: [] };
      const listenersCollection = this.listeners[listenerPath];
      const currentCuttedPath = this.cutPath(listenerPath, updatePath);
      if (this.match(currentCuttedPath, updatePath)) {
        const restPath = this.trimPath(listenerPath.substr(currentCuttedPath.length));
        const values = new WildcardObject(newValue, this.options.delimeter, this.options.wildcard).get(restPath);
        const params = listenersCollection.paramsInfo
          ? this.getParams(listenersCollection.paramsInfo, updatePath)
          : undefined;
        const bulk = [];
        const bulkListeners = {};
        for (const currentRestPath in values) {
          const value = () => values[currentRestPath];
          const fullPath = [updatePath, currentRestPath].join(this.options.delimeter);
          for (const listenerId in listenersCollection.listeners) {
            const listener = listenersCollection.listeners[listenerId];
            const eventInfo = {
              type,
              path: {
                listener: listenerPath,
                update: originalPath ? originalPath : updatePath,
                resolved: fullPath
              },
              params,
              options
            };
            if (listener.options.bulk) {
              bulk.push({ value, path: fullPath, params });
              bulkListeners[listenerId] = listener;
            } else {
              listeners[listenerPath].single.push({ listener, listenersCollection, eventInfo, value });
            }
          }
        }
        for (const listenerId in bulkListeners) {
          const listener = bulkListeners[listenerId];
          const eventInfo = {
            type,
            path: {
              listener: listenerPath,
              update: updatePath,
              resolved: undefined
            },
            options,
            params
          };
          listeners[listenerPath].bulk.push({ listener, listenersCollection, eventInfo, value: bulk });
        }
      }
    }
    return listeners;
  }

  private notifyNestedListeners(
    updatePath: string,
    newValue,
    options: UpdateOptions,
    type: string = 'update',
    alreadyNotified: GroupedListener[],
    originalPath: string = null
  ) {
    return this.notifyListeners(
      this.getNestedListeners(updatePath, newValue, options, type, originalPath),
      alreadyNotified,
      false
    );
  }

  private getNotifyOnlyListeners(
    updatePath: string,
    newValue,
    options: UpdateOptions,
    type: string = 'update',
    originalPath: string = null
  ): GroupedListeners {
    const listeners = {};
    if (
      typeof options.only === 'undefined' ||
      !Array.isArray(options.only) ||
      options.only.length === 0 ||
      !this.canBeNested(newValue)
    ) {
      return listeners;
    }
    options.only.forEach((notifyPath) => {
      const wildcardScan = new WildcardObject(newValue, this.options.delimeter, this.options.wildcard).get(notifyPath);
      listeners[notifyPath] = { bulk: [], single: [] };
      for (const wildcardPath in wildcardScan) {
        const fullPath = updatePath + this.options.delimeter + wildcardPath;
        for (const listenerPath in this.listeners) {
          const listenersCollection = this.listeners[listenerPath];
          const params = listenersCollection.paramsInfo
            ? this.getParams(listenersCollection.paramsInfo, fullPath)
            : undefined;
          if (this.match(listenerPath, fullPath)) {
            const value = () => wildcardScan[wildcardPath];
            const bulkValue = [{ value, path: fullPath, params }];
            for (const listenerId in listenersCollection.listeners) {
              const listener = listenersCollection.listeners[listenerId];
              const eventInfo = {
                type: 'update',
                path: {
                  listener: listenerPath,
                  update: originalPath ? originalPath : updatePath,
                  resolved: fullPath
                },
                params,
                options
              };
              if (listener.options.bulk) {
                if (!listeners[notifyPath].bulk.some((bulkListener) => bulkListener.listener === listener)) {
                  listeners[notifyPath].bulk.push({ listener, listenersCollection, eventInfo, value: bulkValue });
                }
              } else {
                listeners[notifyPath].single.push({
                  listener,
                  listenersCollection,
                  eventInfo,
                  value
                });
              }
            }
          }
        }
      }
    });
    return listeners;
  }

  private notifyOnly(
    updatePath: string,
    newValue,
    options: UpdateOptions,
    type: string = 'update',
    originalPath: string = null
  ): boolean {
    return (
      typeof this.notifyListeners(this.getNotifyOnlyListeners(updatePath, newValue, options, type, originalPath))[0] !==
      'undefined'
    );
  }

  private canBeNested(newValue): boolean {
    return typeof newValue === 'object' && newValue !== null;
  }

  private getUpdateValues(oldValue, split, fn) {
    if (typeof oldValue !== 'undefined' && oldValue !== null) {
      if (oldValue.constructor.name === 'Object') {
        oldValue = { ...oldValue };
      } else if (Array.isArray(oldValue)) {
        oldValue = oldValue.slice();
      }
    }
    let newValue;
    if (typeof fn === 'function') {
      newValue = fn(this.pathGet(split, this.data));
    } else {
      newValue = fn;
    }
    return { newValue, oldValue };
  }

  private wildcardUpdate(updatePath: string, fn: Updater, options: UpdateOptions = defaultUpdateOptions) {
    options = { ...defaultUpdateOptions, ...options };
    const scanned = this.scan.get(updatePath);
    const bulk = {};
    for (const path in scanned) {
      const split = this.split(path);
      const { oldValue, newValue } = this.getUpdateValues(scanned[path], split, fn);
      if (!this.same(newValue, oldValue)) {
        bulk[path] = newValue;
      }
    }
    const groupedListenersPack = [];
    for (const path in bulk) {
      const newValue = bulk[path];
      if (options.only.length) {
        groupedListenersPack.push(this.getNotifyOnlyListeners(path, newValue, options, 'update', updatePath));
      } else {
        groupedListenersPack.push(this.getSubscribedListeners(path, newValue, options, 'update', updatePath));
        if (this.canBeNested(newValue)) {
          groupedListenersPack.push(this.getNestedListeners(path, newValue, options, 'update', updatePath));
        }
      }
      if (options.debug) {
        console.debug('Wildcard update', { path, newValue });
      }
      this.pathSet(this.split(path), newValue, this.data);
    }
    let alreadyNotified = [];
    for (const groupedListeners of groupedListenersPack) {
      alreadyNotified = [...alreadyNotified, ...this.notifyListeners(groupedListeners, alreadyNotified)];
    }
  }

  public update(updatePath: string, fn: Updater, options: UpdateOptions = defaultUpdateOptions) {
    if (this.isWildcard(updatePath)) {
      return this.wildcardUpdate(updatePath, fn, options);
    }
    const split = this.split(updatePath);
    const { oldValue, newValue } = this.getUpdateValues(this.pathGet(split, this.data), split, fn);
    if (options.debug) {
      console.debug(`Updating ${updatePath} ${options.source ? `from ${options.source}` : ''}`, oldValue, newValue);
    }
    if (this.same(newValue, oldValue)) {
      return newValue;
    }
    this.pathSet(split, newValue, this.data);
    options = { ...defaultUpdateOptions, ...options };
    if (this.notifyOnly(updatePath, newValue, options)) {
      return newValue;
    }
    const alreadyNotified = this.notifySubscribedListeners(updatePath, newValue, options);
    if (this.canBeNested(newValue)) {
      this.notifyNestedListeners(updatePath, newValue, options, 'update', alreadyNotified);
    }
    return newValue;
  }

  public get(userPath: string | undefined = undefined) {
    if (typeof userPath === 'undefined' || userPath === '') {
      return this.data;
    }
    return this.pathGet(this.split(userPath), this.data);
  }

  private debugSubscribe(listener: Listener, listenersCollection: ListenersCollection, listenerPath: string) {
    if (listener.options.debug) {
      this.options.log('listener subscribed', listenerPath, listener, listenersCollection);
    }
  }

  private debugListener(time: number, groupedListener: GroupedListener) {
    if (groupedListener.eventInfo.options.debug || groupedListener.listener.options.debug) {
      this.options.log('Listener fired', {
        time: Date.now() - time,
        info: groupedListener,
        jsonInfo: JSON.stringify(groupedListener, null, 2)
      });
    }
  }

  private debugTime(groupedListener: GroupedListener): number {
    return groupedListener.listener.options.debug || groupedListener.eventInfo.options.debug ? Date.now() : 0;
  }
}

export const State = DeepState;
