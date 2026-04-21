/**
 * Single source of truth for the MintU app version.
 *
 * Industry-standard semver. Update this and it propagates everywhere (About
 * screen, Profile version footer, i18n strings, etc.).
 *
 * Keep in sync with:
 *   - /app/frontend/package.json "version"
 *   - /app/frontend/app.json "expo.version"
 */
export const APP_VERSION = '1.0.0';

/** Short label — e.g. "v1.0.0" */
export const APP_VERSION_SHORT = `v${APP_VERSION}`;

/** Long label — e.g. "Version 1.0.0" */
export const APP_VERSION_LONG = `Version ${APP_VERSION}`;
