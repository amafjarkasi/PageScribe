import { vi } from 'vitest';

// Mock Chrome API
global.chrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
  downloads: {
    download: vi.fn(),
  },
} as any;

// Mock WXT defineBackground
(global as any).defineBackground = (cb: any) => cb;
(global as any).defineContentScript = (config: any) => config;

// Mock TextEncoder/TextDecoder for jsdom environment if needed
if (typeof TextEncoder === 'undefined') {
    const { TextEncoder, TextDecoder } = require('util');
    global.TextEncoder = TextEncoder;
    global.TextDecoder = TextDecoder;
}
