// Les choix de caméra et de micro faits au pré-join, tels qu'ils voyagent
// jusqu'à la séance, par la salle d'attente s'il le faut : `1` allumé, `0`
// éteint, la forme que lit `isOnAtEntry` dans `call.tsx`. Un choix absent n'est
// pas écrit, et la séance retombe alors sur les Réglages, jamais sur « allumé ».
export type EntryChoices = { readonly camera?: string; readonly mic?: string };

export function computeEntryQuery(choices: EntryChoices): string {
  const pairs: string[] = [];
  if (choices.camera !== undefined) pairs.push(`camera=${encodeURIComponent(choices.camera)}`);
  if (choices.mic !== undefined) pairs.push(`mic=${encodeURIComponent(choices.mic)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}
