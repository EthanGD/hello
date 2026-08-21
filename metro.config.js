const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const imageMarkerAndroidPath = path.join(
  __dirname,
  'node_modules',
  'react-native-image-marker',
  'android',
);

const config = {
  resolver: {
    // Ignore transient native build directories created under the dependency on
    // Windows. Metro may try to watch them while CMake is deleting them.
    blockList: exclusionList([
      path.join(imageMarkerAndroidPath, '.cxx'),
      path.join(imageMarkerAndroidPath, 'build'),
    ]),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
