import { describe, it, expect } from 'vitest';
import { detectListingUrl } from './listing-types';

describe('detectListingUrl', () => {
  it('detects domain.com.au URLs', () => {
    const result = detectListingUrl('https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812');
    expect(result).toEqual({ url: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812', source: 'domain' });
  });

  it('detects realestate.com.au URLs', () => {
    const result = detectListingUrl('https://www.realestate.com.au/property-house-vic-cowes-143160680');
    expect(result).toEqual({ url: 'https://www.realestate.com.au/property-house-vic-cowes-143160680', source: 'rea' });
  });

  it('detects onthehouse.com.au URLs', () => {
    const result = detectListingUrl('https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-cowes-vic-3922-12345');
    expect(result).toEqual({ url: 'https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-cowes-vic-3922-12345', source: 'onthehouse' });
  });

  it('returns null for unknown URLs', () => {
    expect(detectListingUrl('https://www.google.com')).toBeNull();
  });
});
