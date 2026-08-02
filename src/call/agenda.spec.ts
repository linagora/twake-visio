import { canShowAgenda } from 'src/call/agenda';
import type { InstanceFeatures } from 'src/instance/types';

function features(overrides: Partial<InstanceFeatures> = {}): InstanceFeatures {
  return { recording: false, subtitle: false, telephony: false, calendar: false, ...overrides };
}

describe('canShowAgenda', () => {
  // Les deux états de la conditionnelle, chacun avec sa fixture. Sans le
  // second, l'implémentation pourrait être `return false`.
  it("refuse l'agenda quand l'instance ne déclare pas de calendrier", () => {
    expect(canShowAgenda(features({ calendar: false }))).toBe(false);
  });

  it("autorise l'agenda quand l'instance déclare un calendrier", () => {
    expect(canShowAgenda(features({ calendar: true }))).toBe(true);
  });

  // La capacité ne doit dépendre QUE d'elle-même : sans ce test, un `&&` avec
  // `recording` ou `subtitle` passerait inaperçu, les fixtures ci-dessus les
  // laissant toutes deux à `false`.
  it("n'exige aucune autre capacité", () => {
    expect(canShowAgenda(features({ calendar: true, recording: false, subtitle: false }))).toBe(
      true,
    );
  });

  it("ne s'ouvre pas parce qu'une autre capacité est active", () => {
    expect(
      canShowAgenda(
        features({ calendar: false, recording: true, subtitle: true, telephony: true }),
      ),
    ).toBe(false);
  });
});
