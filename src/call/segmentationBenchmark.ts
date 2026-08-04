import { requireOptionalNativeModule } from 'expo-modules-core';

// L'INSTRUMENT de l'étape 1 du chantier « flou d'arrière-plan ». Il ne participe
// à aucune fonctionnalité, et RIEN ne l'appelle : l'appel qui a produit la
// mesure du 2026-08-02 vivait dans `app/_layout.tsx` et a été retiré une fois le
// chiffre relevé — le dépôt interdit `console.log`, et un instrument n'a pas à
// tourner à chaque démarrage.
//
// Pour le rejouer — sur iOS quand le pendant Vision existera, ou sur un appareil
// d'entrée de gamme, qui est la réserve que la mesure Android laisse ouverte :
// remettre un `useEffect` qui boucle sur `BENCHMARK_SIZES`, journaliser avec
// `console.warn`, lire par `adb logcat`. Le module natif, lui, journalise déjà
// sous le tag `TwakeSegBench`.
//
// `requireOptionalNativeModule` et non `requireNativeModule` : le second LÈVE
// quand le module natif est absent — sous Jest, et sur iOS où ce module n'existe
// pas. Même raison que `src/call/nativeAudioDevices.ts`.

export type SegmentationBenchmark = {
  readonly width: number;
  readonly height: number;
  readonly iterations: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly fps: number;
};

type NativeSegmentationModule = {
  benchmark: (width: number, height: number, iterations: number) => Promise<SegmentationBenchmark>;
};

const nativeModule = requireOptionalNativeModule<NativeSegmentationModule>('TwakeSegmentation');

// Rend `null` quand le module est absent, jamais une valeur inventée : un zéro
// se lirait comme « instantané », soit exactement la fausse conclusion que la
// discipline de mesure de ce dépôt interdit.
export async function runSegmentationBenchmark(
  width: number,
  height: number,
  iterations: number,
): Promise<SegmentationBenchmark | null> {
  if (nativeModule === null) return null;
  return await nativeModule.benchmark(width, height, iterations);
}

// Les deux résolutions qui décident. 640×480 est ce qu'un appel WebRTC publie
// couramment sur mobile ; 1280×720 est la cible haute. Mesurer les deux dit si
// le coût suit la surface, ce qui gouverne le compromis qualité/fluidité.
export const BENCHMARK_SIZES: readonly (readonly [number, number])[] = [
  [640, 480],
  [1280, 720],
];
