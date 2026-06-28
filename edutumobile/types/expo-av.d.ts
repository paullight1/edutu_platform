declare module 'expo-av' {
  export interface Recording {
    prepareToRecordAsync(options?: any): Promise<void>;
    startAsync(): Promise<void>;
    stopAndUnloadAsync(): Promise<void>;
    getURI(): string | null;
  }

  export interface AudioStatic {
    getPermissionsAsync(): Promise<{ granted: boolean }>;
    requestPermissionsAsync(): Promise<{ granted: boolean }>;
    setAudioModeAsync(options: any): Promise<void>;
    RecordingOptionsPresets: {
      HIGH_QUALITY: unknown;
    };
    Recording: new () => Recording;
  }

  export const Audio: AudioStatic;
  export namespace Audio {
    type Recording = import('expo-av').Recording;
  }
}
