'use strict';

let android;
try {
  android = require('@react-native-community/cli-platform-android');
} catch (e) {
  console.warn('[react-native.config.js] Failed to load cli-platform-android:', e.message);
}

let ios;
try {
  ios = require('@react-native-community/cli-platform-ios');
} catch (e) {
  console.warn('[react-native.config.js] Failed to load cli-platform-ios:', e.message);
}

const commands = [];

try {
  const {
    bundleCommand,
    startCommand,
  } = require('@react-native/community-cli-plugin');
  commands.push(bundleCommand, startCommand);
} catch (e) {
  console.warn('[react-native.config.js] Failed to load community-cli-plugin:', e.message);
}

const codegenCommand = {
  name: 'codegen',
  options: [
    {
      name: '--path <path>',
      description: 'Path to the React Native project root.',
      default: process.cwd(),
    },
    {
      name: '--platform <string>',
      description:
        'Target platform. Supported values: "android", "ios", "all".',
      default: 'all',
    },
    {
      name: '--outputPath <path>',
      description: 'Path where generated artifacts will be output to.',
    },
  ],
  func: (argv, config, args) =>
    require('./node_modules/react-native/scripts/codegen/generate-artifacts-executor').execute(
      args.path,
      args.platform,
      args.outputPath,
    ),
};

commands.push(codegenCommand);

const config = {
  commands,
  platforms: {},
};

if (ios != null) {
  config.commands.push(...ios.commands);
  config.platforms.ios = {
    projectConfig: ios.projectConfig,
    dependencyConfig: ios.dependencyConfig,
  };
}

if (android != null) {
  config.commands.push(...android.commands);
  config.platforms.android = {
    projectConfig: android.projectConfig,
    dependencyConfig: android.dependencyConfig,
  };
}

module.exports = config;
