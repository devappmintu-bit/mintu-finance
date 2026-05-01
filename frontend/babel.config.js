/**
 * Babel config for MintU
 *
 * Purpose:
 *  • Use the standard `babel-preset-expo` so every Expo/RN feature works.
 *  • In production bundles (EAS / `expo export`) strip `console.*` calls
 *    — but keep `console.warn` and `console.error` so that production
 *    telemetry (Sentry) still sees anomalies.
 *  • In dev we keep all `console.*` calls to make debugging easier.
 *
 * Phase 5 · Backlog P2 — Strip console.log in production bundles.
 */
module.exports = function (api) {
  api.cache(true);

  const isProd = process.env.NODE_ENV === 'production' || process.env.BABEL_ENV === 'production';

  return {
    presets: ['babel-preset-expo'],
    // In newer Expo SDKs, `babel-preset-expo` already wires up
    // `react-native-reanimated/plugin` at the correct position, so we
    // deliberately do NOT re-add it here (doing so would throw
    // "Reanimated plugin is included twice").
    plugins: [
      ...(isProd
        ? [[
            'transform-remove-console',
            { exclude: ['error', 'warn'] },
          ]]
        : []),
    ],
  };
};
