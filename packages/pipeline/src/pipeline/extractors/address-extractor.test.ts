import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OpenAI
const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockCreate } };
  },
}));

import { extractAddressFromMessage } from './address-extractor';

describe('extractAddressFromMessage', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    mockCreate.mockReset();
  });

  it('extracts a full address from natural text', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            streetNumber: '42',
            streetName: 'Smith',
            streetType: 'St',
            suburb: 'Richmond',
            state: 'VIC',
            postcode: '3121',
          }),
        },
      }],
    });

    const result = await extractAddressFromMessage('What do you think of 42 Smith St, Richmond VIC 3121?');
    expect(result).toEqual({
      streetNumber: '42',
      streetName: 'Smith',
      streetType: 'St',
      suburb: 'Richmond',
      state: 'VIC',
      postcode: '3121',
    });
  });

  it('extracts a unit address', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            unitNumber: '3',
            streetNumber: '15',
            streetName: 'Main',
            streetType: 'Rd',
            suburb: 'Heidelberg',
            state: 'VIC',
            postcode: '3084',
          }),
        },
      }],
    });

    const result = await extractAddressFromMessage('Unit 3/15 Main Rd Heidelberg VIC 3084');
    expect(result).toEqual({
      unitNumber: '3',
      streetNumber: '15',
      streetName: 'Main',
      streetType: 'Rd',
      suburb: 'Heidelberg',
      state: 'VIC',
      postcode: '3084',
    });
  });

  it('returns null when no address is found', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { content: 'null' },
      }],
    });

    const result = await extractAddressFromMessage('What is the best strategy for investing?');
    expect(result).toBeNull();
  });

  it('returns null on LLM error', async () => {
    mockCreate.mockRejectedValue(new Error('API down'));
    const result = await extractAddressFromMessage('42 Smith St Richmond');
    expect(result).toBeNull();
  });

  it('returns null on invalid JSON from LLM', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { content: 'I found an address at 42 Smith St' },
      }],
    });

    const result = await extractAddressFromMessage('42 Smith St Richmond');
    expect(result).toBeNull();
  });
});
