// Preload of the game window (sandboxed, context-isolated). It exposes one small object,
// `window.blacklightNative`: three members, no Node, no Electron objects.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CHANNELS, type InvokeResult, type NativeBridge, type NativeInfo } from '../bridge';

const info = ipcRenderer.sendSync('blacklight:info') as NativeInfo | null;

if (info) {
  const bridge: NativeBridge = {
    info,
    async invoke(module, method, args) {
      if (typeof module !== 'string' || typeof method !== 'string' || !Array.isArray(args)) {
        throw new TypeError('invoke(module: string, method: string, args: unknown[])');
      }
      const result = (await ipcRenderer.invoke(
        CHANNELS.invoke,
        module,
        method,
        args,
      )) as InvokeResult;
      if (result.ok) return result.value;
      throw new Error(result.error);
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('subscribe(listener: function)');
      const forward = (_event: IpcRendererEvent, name: string, payload: unknown) =>
        listener(name, payload);
      ipcRenderer.on(CHANNELS.event, forward);
      return () => {
        ipcRenderer.removeListener(CHANNELS.event, forward);
      };
    },
  };
  contextBridge.exposeInMainWorld('blacklightNative', bridge);
}
