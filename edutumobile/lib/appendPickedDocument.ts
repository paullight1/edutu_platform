import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export function appendPickedDocument(form: FormData, asset: DocumentPickerAsset, mimeType: string) {
  if (Platform.OS === 'web') {
    if (!asset.file) throw new Error('The selected document is unavailable.');
    form.append('file', asset.file, asset.name);
    return;
  }

  // Expo fetch reads the File's bytes. The picker gives its cache copy a
  // generated filename, so preserve the learner's filename in the form part.
  const file = new File(asset.uri);
  Object.defineProperties(file, {
    name: { value: asset.name },
    type: { value: mimeType },
  });
  form.append('file', file);
}
