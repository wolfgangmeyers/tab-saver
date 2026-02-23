import { vi } from 'vitest';

// Build chrome mock manually since vitest-chrome has ESM/CJS issues
// We create a mock that mirrors the Chrome extension API

function createMockEvent() {
  return {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
    hasListeners: vi.fn(),
    callListeners: vi.fn(),
    clearListeners: vi.fn(),
  };
}

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    onChanged: createMockEvent(),
  },
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
    group: vi.fn(),
    getCurrent: vi.fn(),
  },
  tabGroups: {
    query: vi.fn(),
    update: vi.fn(),
  },
  windows: {
    getCurrent: vi.fn(),
  },
  runtime: {
    onInstalled: createMockEvent(),
    lastError: undefined as { message: string } | undefined,
  },
  sidePanel: {
    setPanelBehavior: vi.fn(),
  },
};

Object.assign(globalThis, { chrome: chromeMock });
