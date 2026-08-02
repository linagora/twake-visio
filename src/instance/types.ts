export type InstanceFeatures = {
  readonly recording: boolean;
  readonly subtitle: boolean;
  readonly telephony: boolean;
  // Mesuré le 2026-08-02 : `/api/v1.0/config/` ne porte AUCUN champ de
  // calendrier sur les trois instances connues — `meet.linagora.com`,
  // `visio.twake.app` et `meet.twake-dev.maudet.cloud`, cette dernière d'un
  // build plus récent. Le `.well-known/twake-configuration` de l'organisation
  // n'expose que `twake-flagship-login-uri` et `twake-pass-login-uri`, ce que
  // `twake-guidelines/AGENTS.md:1293-1294` documente aussi.
  //
  // Le champ est donc absent partout et cette valeur vaut `false` partout.
  // C'est voulu, et c'est le sens SÛR : une surface d'agenda sans calendrier
  // derrière produirait une liste vide inexplicable.
  //
  // On ne devine PAS un nom de champ pour faire semblant de sonder : une garde
  // branchée sur un champ inexistant est toujours fausse, donc indiscernable
  // par lecture d'une garde qui marche. Le jour où meet expose un signal, seul
  // le parseur de `discovery.ts` change, et tout consommateur de
  // `canShowAgenda` en hérite sans être touché.
  readonly calendar: boolean;
};

export type InstanceConfig = {
  readonly serverUrl: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly livekitUrl: string;
  readonly features: InstanceFeatures;
};

export type InstanceError = 'unreachable' | 'not-a-meet-instance' | 'oidc-undiscoverable';

export type InstanceResult =
  { ok: true; value: InstanceConfig } | { ok: false; error: InstanceError };
