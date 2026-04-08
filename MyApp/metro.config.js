const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

// Metro 0.83 + @react-navigation/elements v2 호환성 이슈:
// ESM 빌드(lib/module)의 플랫폼별 에셋(back-icon@3x.android.png)을 찾지 못하는 버그.
// unstable_enablePackageExports를 비활성화하면 CJS 빌드(lib/commonjs)를 사용해 해결됨.
const config = {
  resolver: {
    unstable_enablePackageExports: false,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
