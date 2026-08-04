import { useEffect, useState } from 'react';

import type { AudioDeviceChoice } from 'src/call/audioDevices';
import {
  audioRouteControl,
  clearAudioDevice,
  listAudioDevices,
  listAudioOutputs,
  openSystemRoutePicker,
  readCurrentAudioDeviceId,
  routeToPreferredDevice,
  selectAudioDevice,
  selectAudioOutput,
  watchPreferredDevice,
} from 'src/call/audioRoute';
import type { AudioOutputKind } from 'src/call/devices';

export type AudioOutputControl = {
  readonly mode: ReturnType<typeof audioRouteControl>;
  readonly outputs: readonly AudioOutputKind[];
  readonly chosen: AudioOutputKind | null;
  readonly devices: readonly AudioDeviceChoice[];
  readonly currentDeviceId: number | null;
  readonly manual: boolean;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
  readonly onSelect: (kind: AudioOutputKind) => void;
  readonly onSelectDevice: (device: AudioDeviceChoice) => void;
  readonly onAutomatic: () => void;
};

/**
 * Le choix de la sortie audio, monté par DEUX écrans.
 *
 * **Extrait de `callControlBar.tsx` pour le pré-join, et c'est le propriétaire
 * qui l'a demandé** : il a branché son casque Bluetooth sur l'écran d'attente
 * et n'avait aucun moyen de choisir où le son irait avant d'entrer. Le réglage
 * n'existait qu'une fois la séance ouverte — c'est-à-dire trop tard pour la
 * seule personne qui voulait le vérifier.
 *
 * Recopier ces cent lignes dans le second écran aurait garanti leur divergence :
 * elles portent des décisions mesurées — pourquoi le chemin « appareils »
 * n'emprunte jamais `listAudioOutputs`, pourquoi « automatique » réapplique
 * NOTRE préférence — que personne ne rediffuserait à la main.
 */
export function useAudioOutput(
  onNotice: (key: 'call.deviceSwitchFailed' | null) => void,
): AudioOutputControl {
  const [outputs, setOutputs] = useState<readonly AudioOutputKind[]>([]);
  // Ce que *nous* avons demandé pendant cette séance, jamais l'état du système :
  // aucune API ne dit d'où sort le son, sur aucune des deux plateformes. Rien
  // n'est persisté entre deux séances — un choix manuel désarme la bascule
  // automatique côté Android, et le persister la désarmerait pour toujours.
  const [chosen, setChosen] = useState<AudioOutputKind | null>(null);

  // Chemin 'devices' (Android >= 31). `currentDeviceId` est l'état CONSTATÉ, lu
  // par `getCommunicationDevice()`. `manual` est distinct, parce qu'un
  // identifiant courant est renseigné même quand personne n'a rien choisi.
  const [devices, setDevices] = useState<readonly AudioDeviceChoice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<number | null>(null);
  const [manual, setManual] = useState(false);
  const [open, setOpen] = useState(false);

  // Une valeur, pas une lecture de `Platform` par le composant : c'est ce qui
  // permet à une spec de rendre les deux branches sans bouchonner la
  // plateforme.
  const mode = audioRouteControl();

  // Un casque allumé EN COURS DE ROUTE doit prendre le son, comme un casque
  // déjà connecté le prend à l'entrée. Sans cette écoute, la première ligne de
  // la feuille — « Le son suit l'appareil que vous branchez » — ne vaudrait que
  // pour l'entrée.
  useEffect(() => watchPreferredDevice(() => manual), [manual]);

  // La liste est relue à chaque ouverture, et à ce moment seulement : aucun
  // événement de changement de périphérique n'existe sur mobile. Un rejet la
  // vide plutôt que de laisser voir celle, potentiellement périmée, de la
  // dernière ouverture réussie.
  const onOpen = (): void => {
    // Le mode 'system' n'a AUCUNE feuille à ouvrir : sur iOS il n'existe que le
    // sélecteur de la plateforme, dont rien ne dit s'il est apparu.
    if (mode === 'system') {
      openSystemRoutePicker().catch(() => undefined);
      return;
    }
    setOpen(true);
    // Le chemin 'devices' n'emprunte JAMAIS `listAudioOutputs()` : c'est
    // AudioSwitch qui la sert, et AudioSwitch ne tourne pas quand notre module
    // tient la route.
    if (mode === 'devices') {
      Promise.all([listAudioDevices(), readCurrentAudioDeviceId()])
        .then(([list, current]) => {
          setDevices(list);
          setCurrentDeviceId(current);
        })
        .catch(() => {
          setDevices([]);
          setCurrentDeviceId(null);
        });
      return;
    }
    listAudioOutputs()
      .then(setOutputs)
      .catch(() => setOutputs([]));
  };

  // `setCommunicationDevice()` rend un booléen, et un `false` est un vrai refus
  // du système : la coche reste alors où elle était plutôt que d'annoncer une
  // route qui n'a pas pris.
  const onSelectDevice = (device: AudioDeviceChoice): void => {
    selectAudioDevice(device.id)
      .then((routed) => {
        if (!routed) {
          onNotice('call.deviceSwitchFailed');
          return;
        }
        setCurrentDeviceId(device.id);
        setManual(true);
        onNotice(null);
      })
      .catch(() => onNotice('call.deviceSwitchFailed'));
  };

  // `clearCommunicationDevice()` rend la main au système, ce qu'AudioSwitch ne
  // sait pas faire. Rendre la main la rendait à l'ÉCOUTEUR : mesuré, Android ne
  // choisit pas le casque tout seul sur ce chemin. « Automatique » veut donc
  // dire NOTRE automatique — la préférence, réappliquée — sans quoi la ligne
  // qui l'annonce serait fausse en un seul geste.
  const onAutomatic = (): void => {
    clearAudioDevice()
      .then(() => routeToPreferredDevice())
      .then(() => readCurrentAudioDeviceId())
      .then((current) => {
        setManual(false);
        setCurrentDeviceId(current);
      })
      .catch(() => onNotice('call.deviceSwitchFailed'));
  };

  // Posé immédiatement, pas dans un `.then()` : la promesse native est résolue
  // avant que le travail ne soit posté sur son handler, et un identifiant
  // inconnu est un no-op silencieux. L'état enregistre ce qui a été *demandé*,
  // et la feuille l'affiche comme tel — jamais comme un état constaté.
  const onSelect = (kind: AudioOutputKind): void => {
    setChosen(kind);
    setManual(true);
    // Aucune branche d'échec, parce qu'il n'en existe aucune : afficher un
    // succès serait du bruit, afficher un échec serait une invention.
    selectAudioOutput(kind).catch(() => undefined);
  };

  return {
    chosen,
    currentDeviceId,
    devices,
    manual,
    mode,
    onAutomatic,
    onDismiss: () => setOpen(false),
    onOpen,
    onSelect,
    onSelectDevice,
    open,
    outputs,
  };
}
