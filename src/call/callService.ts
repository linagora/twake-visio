import i18next from 'i18next';

import { nativeCallService } from 'src/call/nativeCallService';

/**
 * Le service de premier plan qui garde la capture vivante hors de
 * l'application.
 *
 * MESURÉ sans lui, Pixel 10 Pro Fold (API 36) : cinq secondes après le passage
 * en arrière-plan, la caméra est retirée par le système
 * (`DISCONNECT … (PID 0)`) et `Recording active` tombe à `false`, tandis que la
 * lecture continue. On entend les autres ; eux ne nous voient ni ne nous
 * entendent plus.
 *
 * `useInterruptionRecovery` (`src/call/interruption.ts`) répare le RETOUR. Ceci
 * répare l'ABSENCE. Les deux restent nécessaires : aucun service n'empêche une
 * permission d'être retirée en pleine séance, ni un appel téléphonique de
 * réquisitionner le micro.
 *
 * Les textes sont résolus ici, en JavaScript, et passés au natif : les sept
 * langues du dépôt vivent dans `src/i18n/locales`, et un `strings.xml` en
 * doublerait une partie hors de portée de `src/i18n/index.spec.ts`.
 */
export async function startCallService(): Promise<void> {
  const native = nativeCallService;
  if (native === null) return;
  try {
    // `i18next.t(…)` et NON `import { t } from 'i18next'`, malgré ce que
    // suggère `import/no-named-as-default-member` sur les deux lignes qui
    // suivent. Vérifié dans le paquet installé (i18next 26.3.6) : `t` est une
    // méthode de prototype qui se sert de `this` —
    // `t(...args) { return this.translator?.translate(...args) }`
    // (`dist/esm/i18next.js:2078`) — et le module l'exporte par
    // `const t = instance.t` (ligne 2249), SANS `.bind`. L'import nommé rend
    // donc une fonction détachée : en module ESM, `this` y vaut `undefined` et
    // l'appel jette sur `this.translator`. L'avertissement est un faux positif,
    // et le suivre casserait à l'exécution — pas à la compilation.
    await native.start(i18next.t('call.ongoingTitle'), i18next.t('call.ongoingBody'));
  } catch {
    // Un service qui ne démarre pas prive d'une reprise ; il ne doit jamais
    // empêcher d'entrer en séance. Même règle que le refus de la permission
    // Bluetooth, dont `call.tsx` ignore délibérément le résultat.
  }
}

export async function stopCallService(): Promise<void> {
  const native = nativeCallService;
  if (native === null) return;
  try {
    await native.stop();
  } catch {
    // Appelé depuis un raccrochage ET depuis un démontage : jeter ici
    // laisserait la séance à moitié fermée.
  }
}
