/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  modulePathIgnorePatterns: ["<rootDir>/src-tauri/resources/runtime", "<rootDir>/src-tauri/target"],
  testMatch: ["**/*.test.(ts|tsx)"],
  collectCoverageFrom: ["src/**/*.(ts|tsx)", "!src/**/*.d.ts", "!src/app/**"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
};
