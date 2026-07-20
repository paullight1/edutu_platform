const mockImpact = jest.fn().mockResolvedValue(undefined);
const mockSelection = jest.fn().mockResolvedValue(undefined);
const mockNotification = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-haptics', () => ({
  impactAsync: (...a: unknown[]) => mockImpact(...a),
  selectionAsync: (...a: unknown[]) => mockSelection(...a),
  notificationAsync: (...a: unknown[]) => mockNotification(...a),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
}));

const { haptics, setHapticsEnabled, isHapticsEnabled } = require('../lib/haptics');

describe('haptics façade', () => {
  beforeEach(() => {
    mockImpact.mockClear();
    mockSelection.mockClear();
    mockNotification.mockClear();
    setHapticsEnabled(true);
  });

  it('fires the matching expo-haptics call when enabled', async () => {
    haptics.light();
    haptics.selection();
    haptics.success();
    await Promise.resolve();
    expect(mockImpact).toHaveBeenCalledWith('light');
    expect(mockSelection).toHaveBeenCalled();
    expect(mockNotification).toHaveBeenCalledWith('success');
  });

  it('stays silent for every kind when disabled', async () => {
    setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    haptics.light();
    haptics.medium();
    haptics.heavy();
    haptics.selection();
    haptics.success();
    haptics.error();
    await Promise.resolve();
    expect(mockImpact).not.toHaveBeenCalled();
    expect(mockSelection).not.toHaveBeenCalled();
    expect(mockNotification).not.toHaveBeenCalled();
  });

  it('resumes firing when re-enabled', async () => {
    setHapticsEnabled(false);
    haptics.light();
    setHapticsEnabled(true);
    haptics.light();
    await Promise.resolve();
    expect(mockImpact).toHaveBeenCalledTimes(1);
  });
});
