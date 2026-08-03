/**
 * The voice-mode control captions used to reuse the long accessibility
 * strings ("Mute microphone"), which clipped to "Mute micropho…" under the
 * button. The captions are now their own short keys — this guards both that
 * they exist in every language and that they stay short enough to fit the
 * 96pt control column.
 */
const LOCALES = ['en', 'ar', 'es', 'fr', 'ha', 'hi', 'pt', 'sw', 'zh'] as const;

const REQUIRED_KEYS = [
    'statusReady',
    'statusPaused',
    'muteShort',
    'unmuteShort',
    'endShort',
    'chatShort',
    'actionOpenSettings',
    'actionTryAgain',
    'actionInterrupt',
    'actionResume',
    'orbHint',
];

/** Two lines of ~12 characters is what a 96pt column fits at 12pt. */
const CAPTION_KEYS = ['muteShort', 'unmuteShort', 'endShort', 'chatShort'];
const MAX_CAPTION_CHARS = 24;

describe('voice mode strings', () => {
    it.each(LOCALES)('defines every voice-mode key in %s', (locale) => {
        const voiceMode = require(`../lib/i18n/locales/${locale}/chat.json`).voiceMode;
        REQUIRED_KEYS.forEach((key) => {
            expect(typeof voiceMode[key]).toBe('string');
            expect(voiceMode[key].trim().length).toBeGreaterThan(0);
        });
    });

    it.each(LOCALES)('keeps the voice control captions short in %s', (locale) => {
        const voiceMode = require(`../lib/i18n/locales/${locale}/chat.json`).voiceMode;
        CAPTION_KEYS.forEach((key) => {
            expect(voiceMode[key].length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
        });
    });

    it('keeps the long spoken-out accessibility labels separate from the captions', () => {
        const voiceMode = require('../lib/i18n/locales/en/chat.json').voiceMode;
        expect(voiceMode.mute).not.toBe(voiceMode.muteShort);
        expect(voiceMode.openChat).not.toBe(voiceMode.chatShort);
    });
});
