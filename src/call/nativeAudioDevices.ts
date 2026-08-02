import { requireOptionalNativeModule } from 'expo-modules-core';

export type NativeAudioDevicesModule = {
  isSupported(): boolean;
  listDevices(): Promise<unknown>;
  getCurrentDeviceId(): Promise<number | null>;
  acquire(): Promise<void>;
  release(): Promise<void>;
  selectDevice(id: number): Promise<boolean>;
  clearDevice(): Promise<void>;
  // Fourni par la classe de base des modules Expo, pas par notre Kotlin : le
  // module y déclare seulement `Events("onDevicesChanged")`. Déclaré ici parce
  // que ce type est écrit à la main — le pont ne porte aucun contrat.
  addListener(eventName: 'onDevicesChanged', listener: () => void): { remove(): void };
};

// `requireOptionalNativeModule` et non `requireNativeModule` : le second LÈVE
// quand le module n'est pas lié, et il ne l'est pas sous Jest, ni sur iOS, ni
// dans un binaire construit sans lui. Ici la valeur est simplement `null`, et
// tout le chemin 'devices' se referme proprement.
//
// `listDevices()` est typé `Promise<unknown>` et non `Promise<NativeAudioDevice[]>`,
// exactement pour la raison qui justifie `readCameras` dans `src/call/devices.ts` :
// **le pont natif ne porte aucun contrat**, et c'est `readAudioDevices` qui
// regarde cette forme, sans assertion de type.
export const nativeAudioDevices =
  requireOptionalNativeModule<NativeAudioDevicesModule>('TwakeAudioDevices');
