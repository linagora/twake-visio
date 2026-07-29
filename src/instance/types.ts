export type InstanceFeatures = {
  readonly recording: boolean;
  readonly subtitle: boolean;
  readonly telephony: boolean;
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
  | { ok: true; value: InstanceConfig }
  | { ok: false; error: InstanceError };
