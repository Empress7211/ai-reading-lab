import { describe, expect, it } from 'vitest';
import { messageFromUnknown } from './errorMessage';

describe('messageFromUnknown', () => {
  it('preserves non-empty strings and Error messages, otherwise uses the fallback', () => {
    expect(messageFromUnknown('TAURI_STRING_ERROR', 'fallback')).toBe('TAURI_STRING_ERROR');
    expect(messageFromUnknown(new Error('ERROR_MESSAGE'), 'fallback')).toBe('ERROR_MESSAGE');
    expect(messageFromUnknown({ message: 'not an Error' }, 'fallback')).toBe('fallback');
    expect(messageFromUnknown('   ', 'fallback')).toBe('fallback');
  });
});
