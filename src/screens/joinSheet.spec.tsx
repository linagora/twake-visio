import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import { JoinSheet } from 'src/screens/joinSheet';
import { tokens } from 'src/ui/tokens';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Même préambule que `bottomSheet.spec.tsx` et `formSheet.spec.tsx` : `Modal`
// vit dans un `Portal`, qui lit les encarts de zone sûre.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('src/instance/knownInstances', () => ({
  listKnownHosts: () => ['meet.linagora.com'],
}));

const clipboard = jest.requireMock('expo-clipboard') as { getStringAsync: jest.Mock };

function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// La feuille prend maintenant un hôte ; `host` est fourni par défaut, sinon
// TOUS les tests du fichier casseraient sur un type manquant.
function sheet(
  overrides: Partial<React.ComponentProps<typeof JoinSheet>> = {},
): React.ReactElement {
  return withPaper(
    <JoinSheet
      host="meet.linagora.com"
      onJoinRoom={jest.fn()}
      onSheetDismiss={jest.fn()}
      testID="join"
      visible
      {...overrides}
    />,
  );
}

async function type(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('join-input'), text);
}

describe('JoinSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clipboard.getStringAsync.mockResolvedValue('');
  });

  it('rend dix cases', async () => {
    await render(sheet());

    expect(screen.getAllByTestId(/^join-cell-\d+$/)).toHaveLength(10);
  });

  describe('la frappe', () => {
    it('remplit les cases au fil de la saisie', async () => {
      await render(sheet());
      await type('ogo');

      expect(screen.getByTestId('join-cell-0')).toHaveTextContent('o');
      expect(screen.getByTestId('join-cell-1')).toHaveTextContent('g');
      expect(screen.getByTestId('join-cell-2')).toHaveTextContent('o');
    });

    // La branche « pas encore atteinte » doit être empruntée : sans elle, des
    // cases toujours remplies passeraient le test précédent.
    it('laisse vides les cases non atteintes', async () => {
      await render(sheet());
      await type('ogo');

      expect(screen.getByTestId('join-cell-3')).toHaveTextContent('');
      expect(screen.getByTestId('join-cell-9')).toHaveTextContent('');
    });

    it('normalise une saisie collée avec ses tirets', async () => {
      await render(sheet());
      await type('OGO-KMYY-QRL');

      expect(screen.getByTestId('join-cell-0')).toHaveTextContent('o');
      expect(screen.getByTestId('join-cell-9')).toHaveTextContent('l');
    });
  });

  describe('l’action de validation', () => {
    // Les deux états, chacun avec sa fixture. Le mockup grise le bouton ; on ne
    // le REND PAS, ce qui sort aussi une commande morte de l'arbre
    // d'accessibilité.
    it('ne rend pas l’action tant que le code est incomplet', async () => {
      await render(sheet());
      await type('ogo');

      expect(screen.queryByTestId('join-submit')).toBe(null);
    });

    it('rend l’action quand les dix lettres sont saisies', async () => {
      await render(sheet());
      await type('ogokmyyqrl');

      expect(screen.getByTestId('join-submit')).toBeTruthy();
    });

    // Le slug porte les tirets, la saisie ne les a pas : c'est `formatCodeSlug`
    // qui les rend, et ce test garde le format ATTENDU PAR MEET. `onJoinRoom`
    // remonte maintenant un COUPLE : le slug ET l'hôte par défaut de `sheet()`.
    it('remonte le slug avec ses tirets, accompagné de l’hôte', async () => {
      const onJoinRoom = jest.fn();
      await render(sheet({ onJoinRoom }));
      await type('ogokmyyqrl');
      await fireEvent.press(screen.getByTestId('join-submit'));

      expect(onJoinRoom).toHaveBeenCalledWith({ slug: 'ogo-kmyy-qrl', host: 'meet.linagora.com' });
    });

    // Un hôte DIFFÉRENT de celui par défaut de `sheet()` : une implémentation
    // qui recopierait la chaîne littérale 'meet.linagora.com' au lieu de lire
    // la prop `host` passerait quand même le test précédent.
    it("remonte le slug ET l'hôte courant", async () => {
      const onJoinRoom = jest.fn();
      await render(sheet({ host: 'meet.acme.com', onJoinRoom, onHostChange: jest.fn() }));

      await type('abcdefghij');
      await fireEvent.press(screen.getByTestId('join-submit'));

      expect(onJoinRoom).toHaveBeenCalledWith({ slug: 'abc-defg-hij', host: 'meet.acme.com' });
    });
  });

  describe('coller un lien', () => {
    // Le titre ne dit plus « d'un hôte connu » : le collage ne discrimine plus
    // du tout par hôte (Décision 1) ; `meet.linagora.com` n'est ici qu'un hôte
    // valide parmi d'autres, gardé pour la régression sur le remplissage des
    // cases, pas pour son appartenance à l'allowlist.
    it('accepte un lien de réunion et remplit les cases', async () => {
      clipboard.getStringAsync.mockResolvedValue('https://meet.linagora.com/ogo-kmyy-qrl');
      await render(sheet());
      await fireEvent.press(screen.getByTestId('join-paste'));

      await waitFor(() => expect(screen.getByTestId('join-cell-0')).toHaveTextContent('o'));
      expect(screen.getByTestId('join-cell-9')).toHaveTextContent('l');
    });

    it('n’affiche aucune erreur avant qu’on ait collé', async () => {
      await render(sheet());

      expect(screen.queryByTestId('join-paste-error')).toBe(null);
    });

    it('refuse un presse-papiers vide sans planter', async () => {
      clipboard.getStringAsync.mockResolvedValue('');
      await render(sheet());
      await fireEvent.press(screen.getByTestId('join-paste'));

      await waitFor(() => expect(screen.getByTestId('join-paste-error')).toBeTruthy());
    });
  });

  // Le lot du mode invité abroge le refus d'hôte inconnu au collage — Décision
  // 1 du partenaire humain : appuyer sur « Coller » est un geste délibéré, à la
  // différence d'un lien profond qui arrive sans qu'on l'ait demandé.
  describe('coller, désormais', () => {
    it('accepte un code nu', async () => {
      clipboard.getStringAsync.mockResolvedValue('abc-defg-hij');
      await render(sheet());

      await fireEvent.press(screen.getByTestId('join-paste'));

      await waitFor(() => expect(screen.getByTestId('join-cell-0')).toHaveTextContent('a'));
      expect(screen.queryByTestId('join-paste-error')).toBe(null);
    });

    it("adopte l'hôte d'un lien collé, même inconnu", async () => {
      const onHostChange = jest.fn();
      clipboard.getStringAsync.mockResolvedValue('https://meet.acme.com/abc-defg-hij');
      await render(sheet({ onHostChange }));

      await fireEvent.press(screen.getByTestId('join-paste'));

      await waitFor(() => expect(onHostChange).toHaveBeenCalledWith('meet.acme.com'));
    });

    it("GARDE l'hôte courant quand le collage n'en porte aucun", async () => {
      const onHostChange = jest.fn();
      clipboard.getStringAsync.mockResolvedValue('abc-defg-hij');
      await render(sheet({ onHostChange }));

      await fireEvent.press(screen.getByTestId('join-paste'));

      await waitFor(() => expect(screen.getByTestId('join-cell-0')).toHaveTextContent('a'));
      expect(onHostChange).not.toHaveBeenCalled();
    });

    it('signale un presse-papiers qui ne porte ni lien ni code', async () => {
      clipboard.getStringAsync.mockResolvedValue('bonjour');
      await render(sheet());

      await fireEvent.press(screen.getByTestId('join-paste'));

      await waitFor(() => expect(screen.getByTestId('join-paste-error')).toBeOnTheScreen());
    });
  });

  // La conséquence OBSERVABLE, jamais `props.onHostChange` : une prop consommée
  // vaut `undefined` sur l'élément hôte et l'assertion serait verte partout.
  describe('la rangée de serveur', () => {
    it("n'est PAS rendue sans onHostChange — le cas de home.tsx", async () => {
      await render(sheet());

      expect(screen.queryByTestId('join-host')).toBe(null);
    });

    it('est rendue avec onHostChange — le cas invité', async () => {
      await render(sheet({ onHostChange: jest.fn() }));

      expect(screen.getByTestId('join-host')).toHaveTextContent('meet.linagora.com');
    });

    it('ne marque PAS un hôte connu', async () => {
      await render(sheet({ host: 'meet.linagora.com', onHostChange: jest.fn() }));

      expect(screen.queryByTestId('join-host-unknown')).toBe(null);
    });

    it('marque un hôte hors allowlist', async () => {
      await render(sheet({ host: 'meet.acme.com', onHostChange: jest.fn() }));

      expect(screen.getByTestId('join-host-unknown')).toBeOnTheScreen();
    });
  });

  // Le « Changer » du mockup : un `TextInput` EN REMPLACEMENT du texte, jamais
  // à côté. Aucune de ces cases n'était dans le brief mot pour mot ; chaque
  // conditionnelle qu'elle exerce vient de `joinSheet.tsx`, aux deux états.
  describe('changer l’hôte manuellement', () => {
    it('affiche le bouton « Changer », pas de champ de saisie, tant qu’on n’a pas appuyé dessus', async () => {
      await render(sheet({ onHostChange: jest.fn() }));

      expect(screen.getByTestId('join-host-change')).toBeOnTheScreen();
      expect(screen.queryByTestId('join-host-input')).toBe(null);
    });

    it('affiche un champ pré-rempli de l’hôte courant après avoir appuyé sur « Changer », et masque le bouton', async () => {
      await render(sheet({ host: 'meet.linagora.com', onHostChange: jest.fn() }));

      await fireEvent.press(screen.getByTestId('join-host-change'));

      expect(screen.getByTestId('join-host-input')).toHaveProp('value', 'meet.linagora.com');
      expect(screen.queryByTestId('join-host-change')).toBe(null);
    });

    it('refuse une saisie qui ne forme pas une adresse, sans remonter le changement', async () => {
      const onHostChange = jest.fn();
      await render(sheet({ onHostChange }));
      await fireEvent.press(screen.getByTestId('join-host-change'));

      await fireEvent.changeText(
        screen.getByTestId('join-host-input'),
        'ceci n’est pas une adresse',
      );
      await fireEvent(screen.getByTestId('join-host-input'), 'submitEditing');

      expect(screen.getByTestId('join-host-error')).toBeOnTheScreen();
      expect(onHostChange).not.toHaveBeenCalled();
      // Un essai raté ne referme pas la rangée : le champ reste là pour corriger.
      expect(screen.getByTestId('join-host-input')).toBeOnTheScreen();
    });

    it('efface l’erreur dès que la saisie reprend', async () => {
      await render(sheet({ onHostChange: jest.fn() }));
      await fireEvent.press(screen.getByTestId('join-host-change'));
      await fireEvent.changeText(
        screen.getByTestId('join-host-input'),
        'ceci n’est pas une adresse',
      );
      await fireEvent(screen.getByTestId('join-host-input'), 'submitEditing');
      expect(screen.getByTestId('join-host-error')).toBeOnTheScreen();

      await fireEvent.changeText(screen.getByTestId('join-host-input'), 'meet.acme.com');

      expect(screen.queryByTestId('join-host-error')).toBe(null);
    });

    it('adopte une adresse valide, la remonte et referme le champ', async () => {
      const onHostChange = jest.fn();
      await render(sheet({ onHostChange }));
      await fireEvent.press(screen.getByTestId('join-host-change'));
      await fireEvent.changeText(screen.getByTestId('join-host-input'), 'meet.acme.com');

      await fireEvent(screen.getByTestId('join-host-input'), 'submitEditing');

      expect(onHostChange).toHaveBeenCalledWith('meet.acme.com');
      expect(screen.queryByTestId('join-host-input')).toBe(null);
    });

    // `trimmed.includes('://')` n'était exercé nulle part côté VRAI : les cinq
    // tests ci-dessus ne collent jamais de schéma. Sans ce test, une mutation
    // qui préfixerait toujours `https://` — cassant toute saisie qui porte déjà
    // un schéma — passerait inaperçue.
    it('accepte une adresse saisie avec son schéma déjà présent', async () => {
      const onHostChange = jest.fn();
      await render(sheet({ onHostChange }));
      await fireEvent.press(screen.getByTestId('join-host-change'));
      await fireEvent.changeText(screen.getByTestId('join-host-input'), 'https://meet.acme.com');

      await fireEvent(screen.getByTestId('join-host-input'), 'submitEditing');

      expect(onHostChange).toHaveBeenCalledWith('meet.acme.com');
    });

    // Le champ VIDÉ : garde le rejet d'une entrée vide, quel que soit le
    // mécanisme qui le produit. `normalizeHostInput` n'a PAS de garde dédiée à
    // ce cas — mesurée redondante avec le `catch` sur `new URL('https://')`,
    // qui lève déjà (voir le commentaire de la fonction) — donc ce test ne
    // cible pas une ligne précise : il fixe le comportement OBSERVABLE, qui ne
    // doit pas régresser si le mécanisme interne change à nouveau.
    it('refuse un champ vidé, comme une saisie qui ne forme pas une adresse', async () => {
      const onHostChange = jest.fn();
      await render(sheet({ onHostChange }));
      await fireEvent.press(screen.getByTestId('join-host-change'));
      await fireEvent.changeText(screen.getByTestId('join-host-input'), '');

      await fireEvent(screen.getByTestId('join-host-input'), 'submitEditing');

      expect(screen.getByTestId('join-host-error')).toBeOnTheScreen();
      expect(onHostChange).not.toHaveBeenCalled();
    });
  });

  describe('les couleurs explicites', () => {
    it('pose la couleur du texte d’une case', async () => {
      await render(sheet());
      await type('o');

      expect(screen.getByTestId('join-cell-0')).toHaveStyle({
        color: tokens.color.textPrimary,
      });
    });

    it('pose la couleur de l’indication', async () => {
      await render(sheet());

      expect(screen.getByTestId('join-hint')).toHaveStyle({
        color: tokens.color.textSectionLabel,
      });
    });

    it('pose la couleur du message d’erreur', async () => {
      // 'bonjour', pas un lien d'hôte inconnu : le collage accepte désormais
      // tout hôte, la seule branche qui échoue encore est « ni lien ni code ».
      clipboard.getStringAsync.mockResolvedValue('bonjour');
      await render(sheet());
      await fireEvent.press(screen.getByTestId('join-paste'));

      await waitFor(() =>
        expect(screen.getByTestId('join-paste-error')).toHaveStyle({
          color: tokens.color.danger,
        }),
      );
    });

    // L'hôte inconnu est un FAIT à lire, pas une erreur : Décision 3 du
    // partenaire humain impose `textMeta`, jamais `danger`.
    it('pose une couleur d’INFORMATION, pas de danger, sur le marqueur d’hôte inconnu', async () => {
      await render(sheet({ host: 'meet.acme.com', onHostChange: jest.fn() }));

      expect(screen.getByTestId('join-host-unknown')).toHaveStyle({
        color: tokens.color.textMeta,
      });
    });
  });

  // Le champ réel est TRANSPARENT — c'est ce qui permet aux dix cases
  // d'afficher un seul état. Son curseur système l'est donc aussi : sans ce
  // repère, rien ne dit où l'on en est, ni même que le champ a le focus.
  describe('le repère de saisie', () => {
    // La position, case par case. Les deux états de `focused` ET les deux
    // bornes de `code.length` : un repère posé sans condition, ou posé toujours
    // au même endroit, échoue ici.
    it('ne marque aucune case tant que le champ n’a pas le focus', async () => {
      await render(sheet());

      expect(screen.queryByTestId('join-caret')).toBe(null);
    });

    it('marque la PREMIÈRE case dès la prise de focus', async () => {
      await render(sheet());

      await fireEvent(screen.getByTestId('join-input'), 'focus');

      expect(screen.getByTestId('join-caret')).toBeTruthy();
      expect(screen.getByTestId('join-cell-0')).toHaveStyle({ color: tokens.color.textPrimary });
    });

    it('avance le repère derrière le dernier caractère saisi', async () => {
      await render(sheet());
      await fireEvent(screen.getByTestId('join-input'), 'focus');

      await fireEvent.changeText(screen.getByTestId('join-input'), 'abc');

      // Le repère est UNIQUE : s'il en restait un sur la case 0, `getByTestId`
      // jetterait sur la multiplicité plutôt que de rendre le bon.
      expect(screen.getByTestId('join-caret')).toBeTruthy();
      // Et les trois cases précédentes portent bien les caractères, donc le
      // repère est en quatrième position et nulle part ailleurs.
      expect(screen.getByTestId('join-cell-0')).toHaveTextContent('a');
      expect(screen.getByTestId('join-cell-2')).toHaveTextContent('c');
      expect(screen.getByTestId('join-cell-3')).toHaveTextContent('');
    });

    it('ne marque plus rien une fois le code complet', async () => {
      await render(sheet());
      await fireEvent(screen.getByTestId('join-input'), 'focus');

      await fireEvent.changeText(screen.getByTestId('join-input'), 'abcdefghij');

      // `code.length` vaut alors le nombre de cases, un index hors du rang :
      // il n'y a plus rien à saisir, et le bouton d'envoi vient d'apparaître.
      expect(screen.queryByTestId('join-caret')).toBe(null);
      expect(screen.getByTestId('join-submit')).toBeTruthy();
    });

    // La seule chose que RNTL puisse dire du CENTRAGE de la barre. Elle ne
    // dispose rien, donc « centré » ne se voit que sur un appareil — mais la
    // direction, elle, se lit, et c'est elle qui décide. En colonne, la barre
    // et le nœud de texte vide s'empilaient : ~48 dp dans une case de 52, donc
    // la barre remontait dans la moitié haute. Signalé sur appareil.
    it('dispose la case en RANGÉE, pour que la barre soit centrée', async () => {
      await render(sheet());
      await fireEvent(screen.getByTestId('join-input'), 'focus');

      expect(screen.getByTestId('join-box-0')).toHaveStyle({
        alignItems: 'center',
        flexDirection: 'row',
      });
    });

    it('retire le repère quand le champ perd le focus', async () => {
      await render(sheet());
      await fireEvent(screen.getByTestId('join-input'), 'focus');
      expect(screen.getByTestId('join-caret')).toBeTruthy();

      await fireEvent(screen.getByTestId('join-input'), 'blur');

      expect(screen.queryByTestId('join-caret')).toBe(null);
    });
  });
});
