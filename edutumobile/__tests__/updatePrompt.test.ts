jest.mock('expo-updates', () => ({
  isEnabled: false,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

import { checkForUpdateWithPrompt } from '../lib/updatePrompt';

const createAlert = () => jest.fn<void, [string, string, Array<{ text: string; style?: string; onPress?: () => void }>]>();

describe('checkForUpdateWithPrompt', () => {
  it('skips development environments', async () => {
    const updates = {
      isEnabled: true,
      checkForUpdateAsync: jest.fn(),
      fetchUpdateAsync: jest.fn(),
      reloadAsync: jest.fn(),
    };
    const alert = createAlert();

    const result = await checkForUpdateWithPrompt({
      updates,
      alert,
      isDev: true,
      platformOS: 'ios',
    });

    expect(result).toBe('skipped');
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('skips when expo-updates is unavailable', async () => {
    const updates = {
      isEnabled: false,
      checkForUpdateAsync: jest.fn(),
      fetchUpdateAsync: jest.fn(),
      reloadAsync: jest.fn(),
    };

    const result = await checkForUpdateWithPrompt({
      updates,
      alert: createAlert(),
      isDev: false,
      platformOS: 'android',
    });

    expect(result).toBe('skipped');
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('prompts, downloads, and reloads an available update', async () => {
    const updates = {
      isEnabled: true,
      checkForUpdateAsync: jest.fn().mockResolvedValue({
        isAvailable: true,
        isRollBackToEmbedded: false,
        manifest: {},
        reason: undefined,
      }),
      fetchUpdateAsync: jest.fn().mockResolvedValue({
        isNew: true,
        isRollBackToEmbedded: false,
        manifest: {},
      }),
      reloadAsync: jest.fn().mockResolvedValue(undefined),
    };
    const alert = createAlert();

    const result = await checkForUpdateWithPrompt({
      updates,
      alert,
      isDev: false,
      platformOS: 'ios',
    });

    expect(result).toBe('prompted');
    expect(alert).toHaveBeenCalledWith(
      'Update available',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Later' }),
        expect.objectContaining({ text: 'Update' }),
      ])
    );

    const updateButton = alert.mock.calls[0][2].find((button) => button.text === 'Update');
    await updateButton?.onPress?.();

    expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenLastCalledWith(
      'Update ready',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Later' }),
        expect.objectContaining({ text: 'Restart' }),
      ])
    );

    const restartButton = alert.mock.calls[1][2].find((button) => button.text === 'Restart');
    await restartButton?.onPress?.();

    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });
});
