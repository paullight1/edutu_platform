# Patched minimatch compatibility

All matching delegates to upstream minimatch 11.0.4, installed under the distinct minimatch-engine alias. This adapter adds the legacy callable CommonJS/default export and preserves callable defaults() while retaining modern named exports. It does not reimplement parsing or matching.

Glob 7 relies on private minimatch 3 parser internals and is not supported by this adapter. The learner ESLint upgrade removes that consumer. The backend webpack checker uses only the public callable API, which the adapter preserves. The remaining public callable/default imports, including ESM @eslint/eslintrc, are covered by dependency-security regressions. Keep the three app copies identical.
