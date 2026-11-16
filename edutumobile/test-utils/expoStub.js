// Jest stand-in for the `expo` package (wired up via moduleNameMapper).
//
// The real `expo` entry pulls in the winter runtime and the native module
// registry, both of which throw under jest. It used to map to `empty.js`, but
// an empty object breaks any suite that imports the REAL expo-router: its
// `utils/splash` calls `requireOptionalNativeModule('ExpoSplashScreen')` at
// module scope, so the import blew up with "requireOptionalNativeModule is not
// a function" before a single test ran.
//
// Returning null from the optional lookups is exactly the "no native module
// available" path those callers already handle — splash hide/show become
// no-ops rather than errors.
const requireOptionalNativeModule = () => null;

// Native views render as plain Views: expo-router and the expo-* UI wrappers
// call these at module scope, so they have to return *something* renderable.
const nativeViewStub = (props) => {
  const React = require('react');
  const { View } = require('react-native');
  return React.createElement(View, props, props && props.children);
};

module.exports = {
  requireOptionalNativeModule,
  requireOptionalNativeViewManager: () => nativeViewStub,
  requireNativeView: () => nativeViewStub,
  requireNativeViewManager: () => nativeViewStub,
  requireNativeModule: (name) => {
    throw new Error(`Native module "${name}" is unavailable under jest.`);
  },
  registerRootComponent: () => {},
  isRunningInExpoGo: () => false,
};
