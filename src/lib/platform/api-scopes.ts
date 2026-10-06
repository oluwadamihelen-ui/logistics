export const API_SCOPES = ["shipments:create", "shipments:read", "shipments:cancel", "tracking:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];
