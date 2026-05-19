import type { Page } from '@playwright/test';

const DEFAULT_RESPONSES: Record<string, unknown> = {
  get_stats: { total_files: 5, organized_files: 3, duplicate_files: 0, email_files: 0 },
  get_watch_dirs: [],
  get_prefs: [],
  get_api_key_masked: '',
  get_rules: [],
  get_recent_activity: [],
  get_unsorted_files: [],
  get_files_by_category: [],
  'plugin:event|listen': 0,
  'plugin:event|unlisten': null,
  'plugin:event|emit': null,
};

export async function setupTauriMock(
  page: Page,
  overrides: Record<string, unknown> = {}
) {
  const responses = { ...DEFAULT_RESPONSES, ...overrides };

  await page.addInitScript((responses) => {
    (window as any)._tauriEventListeners = {} as Record<string, number[]>;
    (window as any)._tauriCallbackId = 0;
    (window as any)._tauriCallbacks = new Map<number, { cb: Function; once: boolean }>();

    (window as any).__TAURI_INTERNALS__ = {
      transformCallback: (cb: Function, once?: boolean) => {
        const id = ++(window as any)._tauriCallbackId;
        (window as any)._tauriCallbacks.set(id, { cb, once: !!once });
        return id;
      },
      invoke: async (cmd: string, args: any) => {
        if (cmd === 'plugin:event|listen') {
          const event = args?.event as string;
          const handler = args?.handler as number;
          if (event) {
            if (!(window as any)._tauriEventListeners[event]) {
              (window as any)._tauriEventListeners[event] = [];
            }
            (window as any)._tauriEventListeners[event].push(handler);
          }
          return 0;
        }
        if (cmd === 'plugin:event|unlisten') return null;
        if (cmd === 'plugin:event|emit') return null;
        if (cmd in (responses as any)) return (responses as any)[cmd];
        return null;
      },
      metadata: { currentWindow: { label: 'main' } },
    };

    // Helper: fire a Tauri event from test code
    (window as any).fireTauriEvent = (eventName: string, payload: unknown) => {
      const listeners: number[] = (window as any)._tauriEventListeners[eventName] || [];
      for (const handlerId of listeners) {
        const entry = (window as any)._tauriCallbacks.get(handlerId);
        if (entry) {
          entry.cb({ event: eventName, payload, id: 1, windowLabel: 'main' });
          if (entry.once) (window as any)._tauriCallbacks.delete(handlerId);
        }
      }
    };
  }, responses);
}
