import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalUserCVs, createUserCV, fetchUserCV } from '../packages/core/src/services/cv';

beforeEach(async () => { await AsyncStorage.clear(); });

test('offline CV lookup cannot read another account’s cached CV', async () => {
  const offline = { from: () => { throw new Error('offline'); } } as any;
  const cv = await createUserCV(offline, 'user_alice', { name: 'Private CV' });
  expect(await fetchUserCV(offline, cv.id, 'user_bob')).toBeNull();
  expect((await fetchUserCV(offline, cv.id, 'user_alice'))?.name).toBe('Private CV');
});

test('purging one account leaves another account’s offline CV intact', async () => {
  const offline = { from: () => { throw new Error('offline'); } } as any;
  const alice = await createUserCV(offline, 'user_alice', { name: 'Alice' });
  const bob = await createUserCV(offline, 'user_bob', { name: 'Bob' });
  await clearLocalUserCVs('user_alice');
  expect(await fetchUserCV(offline, alice.id, 'user_alice')).toBeNull();
  expect((await fetchUserCV(offline, bob.id, 'user_bob'))?.name).toBe('Bob');
});
