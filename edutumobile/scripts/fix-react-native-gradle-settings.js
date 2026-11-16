const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native',
  'settings.gradle.kts',
);

if (!fs.existsSync(targetPath)) {
  process.exit(0);
}

const marker = 'rootProject.name = "react-native-build-from-source"';
const includeSnippet = `// Make the React Native Gradle plugin visible inside this included build too.
val reactNativeGradlePlugin = file(
    providers.exec {
      workingDir(rootDir)
      commandLine(
          "node",
          "--print",
          "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })",
      )
    }.standardOutput.asText.get().trim()
).parentFile.absolutePath

includeBuild(reactNativeGradlePlugin)
`;

let source = fs.readFileSync(targetPath, 'utf8');

if (source.includes('@react-native/gradle-plugin/package.json')) {
  process.exit(0);
}

if (!source.includes(marker)) {
  throw new Error(`Could not locate insertion point in ${targetPath}`);
}

source = source.replace(`}\n\n${marker}`, `}\n\n${includeSnippet}\n${marker}`);
fs.writeFileSync(targetPath, source);
