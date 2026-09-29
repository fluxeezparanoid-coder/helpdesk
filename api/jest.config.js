module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', target: 'ES2022', emitDecoratorMetadata: true, experimentalDecorators: true, esModuleInterop: true, strict: true, strictPropertyInitialization: false, skipLibCheck: true, types: ['node', 'jest'] } }] },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/env.ts'],
  testTimeout: 30000,
};
