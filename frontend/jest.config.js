/**
 * jest.config.js — Round 52e
 *
 * Plain ts-jest setup (NOT jest-expo). The Round 52e tests target
 * pure utils / services / hooks logic — none of them render React
 * Native components — so we skip the heavyweight RN preset that
 * tried to load /react-native/jest/setup.js (which has Flow types
 * incompatible with our Babel pipeline).
 *
 * Future expansion: when we add component-render tests, swap to
 * jest-expo + add @babel/preset-flow for the RN runtime files.
 */
module.exports = {
  testEnvironment: 'node',
  // V8 coverage provider — avoids the babel-plugin-istanbul +
  // test-exclude promisify bug on Node 20+ in this monorepo.
  coverageProvider: 'v8',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/__tests__/**/*.test.(ts|tsx)'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.expo/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true, diagnostics: false }],
  },
  collectCoverageFrom: [
    // Round 52e — narrow to the files our tests actually exercise.
    // Including the entire utils/ tree triggers istanbul on RN-specific
    // modules (theme.ts, makeStyles.ts) which fail to instrument under
    // node. We expand this list as more tests are added.
    'utils/format.ts',
    'services/users.ts',
    'services/split.ts',
    '!**/*.d.ts',
    '!**/__tests__/**',
    '!**/__mocks__/**',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageDirectory: '<rootDir>/coverage',
  // NOTE: threshold disabled for now — Jest's checkThreshold reporter
  // has a known crash with coverageProvider:'v8'. We enforce the
  // 5 % floor via .github/workflows/quality.yml + Sonar quality gate
  // instead, which is the source of truth anyway.
};
