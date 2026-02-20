/**
 * Tests for server/default-sounds.js — programmatic WAV sound generation.
 */
const { getDefaultSounds } = require('../../server/default-sounds');

describe('getDefaultSounds', () => {
  let sounds;

  beforeAll(() => {
    // Generate once — this is slow (~200ms) so cache it
    sounds = getDefaultSounds();
  });

  test('returns exactly 16 sounds', () => {
    expect(sounds).toHaveLength(16);
  });

  test('every sound has required properties', () => {
    const requiredKeys = [
      'name', 'emoji', 'trimmedAudio', 'originalAudio',
      'trimStart', 'trimEnd', 'duration', 'volume',
      'isGlobal', 'isDefault', 'page',
    ];

    sounds.forEach(sound => {
      requiredKeys.forEach(key => {
        expect(sound).toHaveProperty(key);
      });
    });
  });

  test('all sound names are non-empty strings', () => {
    sounds.forEach(sound => {
      expect(typeof sound.name).toBe('string');
      expect(sound.name.length).toBeGreaterThan(0);
    });
  });

  test('all sounds have unique names', () => {
    const names = sounds.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('all emojis are non-empty strings', () => {
    sounds.forEach(sound => {
      expect(typeof sound.emoji).toBe('string');
      expect(sound.emoji.length).toBeGreaterThan(0);
    });
  });

  test('trimmedAudio is a valid WAV data URI', () => {
    sounds.forEach(sound => {
      expect(sound.trimmedAudio).toMatch(/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/);
    });
  });

  test('originalAudio matches trimmedAudio (no custom trim)', () => {
    sounds.forEach(sound => {
      expect(sound.originalAudio).toBe(sound.trimmedAudio);
    });
  });

  test('trimStart is 0 for all defaults', () => {
    sounds.forEach(sound => {
      expect(sound.trimStart).toBe(0);
    });
  });

  test('trimEnd equals duration for all defaults', () => {
    sounds.forEach(sound => {
      expect(sound.trimEnd).toBe(sound.duration);
    });
  });

  test('duration is a positive number', () => {
    sounds.forEach(sound => {
      expect(typeof sound.duration).toBe('number');
      expect(sound.duration).toBeGreaterThan(0);
    });
  });

  test('volume is 1.0 for all defaults', () => {
    sounds.forEach(sound => {
      expect(sound.volume).toBe(1.0);
    });
  });

  test('isGlobal is false for all defaults', () => {
    sounds.forEach(sound => {
      expect(sound.isGlobal).toBe(false);
    });
  });

  test('isDefault is true for all defaults', () => {
    sounds.forEach(sound => {
      expect(sound.isDefault).toBe(true);
    });
  });

  test('page is either "classic" or "meme"', () => {
    sounds.forEach(sound => {
      expect(['classic', 'meme']).toContain(sound.page);
    });
  });

  test('has expected sound names (spot check)', () => {
    const names = sounds.map(s => s.name);
    expect(names).toContain('Airhorn');
    expect(names).toContain('Crickets');
    expect(names).toContain('Vine Boom');
    expect(names).toContain('Bruh');
    expect(names).toContain('Sus');
    expect(names).toContain('Toot');
  });

  test('WAV data decodes to valid RIFF header', () => {
    // Spot-check the first sound's WAV binary
    const base64 = sounds[0].trimmedAudio.replace('data:audio/wav;base64,', '');
    const buf = Buffer.from(base64, 'base64');

    // RIFF header
    expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
    expect(buf.toString('ascii', 12, 16)).toBe('fmt ');

    // PCM format (1)
    expect(buf.readUInt16LE(20)).toBe(1);
    // Mono
    expect(buf.readUInt16LE(22)).toBe(1);
    // Sample rate 22050
    expect(buf.readUInt32LE(24)).toBe(22050);
    // 16-bit
    expect(buf.readUInt16LE(34)).toBe(16);
  });
});
