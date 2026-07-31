import { VideoTrack } from '@livekit/react-native';
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { CallLayout, VideoTrackRef, Tile } from 'src/call/layout';
import { CallStage } from './stage';

// Ce que ces tests peuvent montrer, et ce qu'ils ne peuvent pas : `VideoTrack`
// est un bouchon qui ne rend rien (voir `__mocks__/@livekit/react-native.ts`).
// On vérifie donc **le câblage** — quelle référence de piste, quel miroir, quel
// cadrage chaque surface réclame — et jamais qu'une image est apparue. Aucun
// test de ce fichier ne prouve quoi que ce soit de visible.

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function fakeCamera(sid: string): VideoTrackRef {
  return { publication: { trackSid: sid } } as unknown as VideoTrackRef;
}

function tile(key: string, overrides: Partial<Tile> = {}): Tile {
  return {
    key,
    source: 'camera',
    name: key,
    track: fakeCamera(`ts-${key}`),
    isLocal: false,
    isSpeaking: false,
    mirror: false,
    ...overrides,
  };
}

function layout(stage: Tile, filmstrip: readonly Tile[] = []): CallLayout {
  return { stage, filmstrip };
}

function propsFor(sid: string): Record<string, unknown> | undefined {
  return jest
    .mocked(VideoTrack)
    .mock.calls.map(([props]) => props as unknown as Record<string, unknown>)
    .find((props) => {
      const trackRef = props.trackRef as { publication: { trackSid: string } } | undefined;
      return trackRef?.publication.trackSid === sid;
    });
}

beforeEach(() => {
  jest.mocked(VideoTrack).mockClear();
});

describe('CallStage', () => {
  it('pose la vignette de scène et toutes celles de la bande', async () => {
    await render(
      <CallStage layout={layout(tile('ada'), [tile('me'), tile('bob'), tile('cid')])} />,
    );

    expect(screen.getByTestId('active-speaker')).toBeTruthy();
    expect(screen.getByTestId('filmstrip')).toBeTruthy();
    expect(screen.getByTestId('tile-ada')).toBeTruthy();
    // La bande entière, pas seulement la première : une boucle qui s'arrête au
    // premier élément est invisible tant qu'on ne compte pas.
    expect(['me', 'bob', 'cid'].map((key) => screen.queryByTestId(`tile-${key}`))).not.toContain(
      null,
    );
  });

  it('transmet à VideoTrack la piste que la sélection a choisie', async () => {
    const camera = fakeCamera('ts-choisie');

    await render(<CallStage layout={layout(tile('ada', { track: camera }))} />);

    expect(jest.mocked(VideoTrack).mock.calls[0]?.[0].trackRef).toBe(camera);
  });

  it('transmet le miroir décidé par la sélection, vignette par vignette', async () => {
    // Le miroir n'est pas une propriété de la surface : la vignette locale est
    // retournée, celle des autres non, et les deux cohabitent dans la bande.
    await render(
      <CallStage
        layout={layout(tile('ada'), [tile('me', { isLocal: true, mirror: true }), tile('bob')])}
      />,
    );

    expect(propsFor('ts-me')?.mirror).toBe(true);
    expect(propsFor('ts-bob')?.mirror).toBe(false);
  });

  it('cadre la scène en entier et remplit les vignettes', async () => {
    // `cover` sur la scène couperait les deux tiers d'un visage filmé en
    // paysage sur un écran tenu en portrait ; `contain` sur une vignette de
    // cent pixels n'y laisserait qu'une bande.
    await render(<CallStage layout={layout(tile('ada'), [tile('me')])} />);

    expect(propsFor('ts-ada')?.objectFit).toBe('contain');
    expect(propsFor('ts-me')?.objectFit).toBe('cover');
  });

  it('pose un carton nommé, et aucune vidéo, quand il n’y a pas de piste', async () => {
    await render(<CallStage layout={layout(tile('ada', { track: null }))} />);

    expect(screen.getByTestId('tile-placeholder-ada')).toHaveTextContent('ada');
    expect(VideoTrack).not.toHaveBeenCalled();
  });

  it('nomme une personne sans nom par une chaîne traduite', async () => {
    // Jamais d'identité brute ni de vide à l'écran : les deux se lisent comme
    // un défaut d'affichage.
    await render(<CallStage layout={layout(tile('ada', { track: null, name: '' }))} />);

    expect(screen.getByTestId('tile-placeholder-ada')).toHaveTextContent('call.unnamedParticipant');
  });

  it('donne son nom à chaque vignette pour qui ne voit pas l’image', async () => {
    // Une piste vidéo ne dit rien à un lecteur d'écran : le nom est tout ce
    // qu'il reste, et il doit être là avec ou sans image.
    await render(
      <CallStage layout={layout(tile('ada'), [tile('bob', { track: null, name: 'Bob' })])} />,
    );

    expect(screen.getByTestId('tile-ada')).toHaveProp('accessibilityLabel', 'ada');
    expect(screen.getByTestId('tile-bob')).toHaveProp('accessibilityLabel', 'Bob');
  });
});
