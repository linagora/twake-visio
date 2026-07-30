import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { CameraChoice } from 'src/call/devices';
import { CameraMenu } from './cameraMenu';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `Menu` monte son contenu dans un `Portal`, qui jette sans `PaperProvider`
// ancêtre. Le double officiel de `react-native-safe-area-context` est requis
// par ce `Provider`, comme dans `call.spec.tsx`.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `animation.scale` à zéro ramène à zéro la durée de l'animation de fermeture
// que `Menu` lance au montage — sans quoi son rappel de fin, qui remet
// `rendered` à faux, tombe 250 ms plus tard et annule l'ouverture.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// Même à durée nulle, ce rappel part sur un `requestAnimationFrame` : sous Jest,
// `NativeAnimatedModule` est absent et `Animated` retombe sur son moteur
// JavaScript. Mesuré : 39 ouvertures sur 40 sans ce vidage, 300 sur 300 avec.
async function settleMenus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

const FRONT: CameraChoice = {
  deviceId: 'cam-front',
  facing: 'user',
  nameKey: 'call.cameraFront',
  ordinal: null,
};

const BACK: CameraChoice = {
  deviceId: 'cam-back',
  facing: 'environment',
  nameKey: 'call.cameraBack',
  ordinal: null,
};

describe('CameraMenu', () => {
  it("n'appelle pas onOpen au montage, et n'affiche rien", async () => {
    // La liste est relue à l'ouverture, et à ce moment seulement : c'est le
    // seul instant où l'utilisateur regarde. Une relecture au montage
    // énumérerait les caméras de toute séance, ouverte ou non.
    const onOpen = jest.fn();

    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={onOpen}
          onSelect={jest.fn()}
        />,
      ),
    );

    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByTestId('camera-option-cam-back')).toBeNull();
  });

  it("demande une relecture à l'ouverture", async () => {
    const onOpen = jest.fn();

    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={onOpen}
          onSelect={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('rend la caméra pressée, pas la première de la liste', async () => {
    // Deux caméras, jamais une seule, et la seconde visée : avec une seule,
    // « transmet la ligne pressée » et « renvoie toujours la première » seraient
    // indiscernables.
    const onSelect = jest.fn();

    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={onSelect}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    // Le `CameraChoice` entier, pas seulement son `deviceId` : l'écran a besoin
    // de `facing` pour le miroir de sa propre vignette.
    expect(onSelect).toHaveBeenCalledWith(BACK);
    expect(onSelect).not.toHaveBeenCalledWith(FRONT);
  });

  it('coche la caméra active, et elle seule', async () => {
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId="cam-back"
          onOpen={jest.fn()}
          onSelect={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByTestId('camera-check-cam-back')).toBeTruthy());
    expect(screen.queryByTestId('camera-check-cam-front')).toBeNull();
  });

  it("ne coche rien quand aucune caméra n'est connue", async () => {
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    expect(screen.queryByTestId('camera-check-cam-front')).toBeNull();
    expect(screen.queryByTestId('camera-check-cam-back')).toBeNull();
  });

  it("s'ouvre sans jeter sur une liste vide", async () => {
    // `listCameras` peut rendre `[]` : le chevron ne peut pas être désactivé
    // (une couleur explicite est ignorée sur un bouton `disabled`), et un
    // message d'erreur pour une liste qu'on vient de demander à voir n'aide
    // personne à agir.
    await render(
      withPaper(
        <CameraMenu cameras={[]} activeDeviceId={null} onOpen={jest.fn()} onSelect={jest.fn()} />,
      ),
    );

    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    expect(screen.getByTestId('camera-menu-btn')).toBeTruthy();
  });

  it('compose un nom numéroté quand la face compte plusieurs caméras', async () => {
    // Un iPhone Pro rend plusieurs caméras arrière : nommées depuis `facing`
    // seul, elles porteraient toutes le même nom.
    const second: CameraChoice = { ...BACK, deviceId: 'cam-back-2', ordinal: 2 };
    const first: CameraChoice = { ...BACK, ordinal: 1 };

    await render(
      withPaper(
        <CameraMenu
          cameras={[first, second]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back-2')).toBeTruthy());
    // Le `t` bouchonné rend la clé : la composition passe par
    // `call.cameraNumbered`, pas par une concaténation en JavaScript.
    expect(screen.getAllByText('call.cameraNumbered')).toHaveLength(2);
  });

  it("affiche le nom nu quand la face n'a qu'une caméra", async () => {
    // L'autre borne : sans elle, une composition inconditionnelle passerait le
    // test précédent tout en affichant « Caméra avant 1 » sur un téléphone qui
    // n'a qu'une caméra avant.
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByText('call.cameraBack')).toBeTruthy());
    expect(screen.queryByText('call.cameraNumbered')).toBeNull();
  });
});
