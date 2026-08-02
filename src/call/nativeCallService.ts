import { requireOptionalNativeModule } from 'expo-modules-core';

export type NativeCallServiceModule = {
  start(title: string, body: string): Promise<void>;
  stop(): Promise<void>;
};

// `requireOptionalNativeModule` pour la raison exacte de
// `src/call/nativeAudioDevices.ts` : `requireNativeModule` LÈVE quand le module
// n'est pas lié — sous Jest, sur iOS, et dans un binaire construit sans lui.
// Ici la valeur vaut simplement `null`, et `src/call/callService.ts` se referme
// sans bruit.
export const nativeCallService =
  requireOptionalNativeModule<NativeCallServiceModule>('TwakeCallService');
