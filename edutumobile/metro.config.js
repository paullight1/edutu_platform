const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Production optimizations
config.transformer.getTransformOptions = async () => ({
  transform: {
    inlineRequires: true,
  },
});

// Support for .mjs files
config.resolver.sourceExts = [...config.resolver.sourceExts, "mjs"];

// Resolve local workspace packages
config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules || {}),
    "ws": require.resolve("./empty.js"),
};

// Watch the packages directory for changes
config.watchFolders = [
    path.resolve(__dirname, "packages/core"),
];

module.exports = config;
