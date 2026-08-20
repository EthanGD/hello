const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname.endsWith(path.sep + 'scripts')
  ? path.resolve(__dirname, '..')
  : process.cwd();

function readVersions(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch (_e) {
    return [];
  }
}

function readSdkRootFromLocalProperties(projectRoot) {
  const localProps = path.join(projectRoot, 'android', 'local.properties');
  if (!fs.existsSync(localProps)) return null;
  try {
    const raw = fs.readFileSync(localProps, 'utf8');
    const match = raw.match(/^\s*sdk\.dir\s*=\s*(.+)$/m);
    if (!match) return null;
    let sdkDir = match[1].trim();
    sdkDir = sdkDir.replace(/\\\\/g, '\\').replace(/\\:/g, ':');
    return sdkDir;
  } catch (_e) {
    return null;
  }
}

function detectAndroidSdkManually(projectRoot) {
  const sdkRoot =
    process.env.ANDROID_SDK_ROOT ||
    process.env.ANDROID_HOME ||
    readSdkRootFromLocalProperties(projectRoot || PROJECT_ROOT) ||
    null;
  if (!sdkRoot) return null;
  const buildTools = readVersions(path.join(sdkRoot, 'build-tools'));
  const apiLevels = readVersions(path.join(sdkRoot, 'platforms'))
    .map((n) => n.replace(/^android-/, ''))
    .filter((n) => /^\d+/.test(n));
  const cmdlineTools = readVersions(path.join(sdkRoot, 'cmdline-tools'));
  const ndk = readVersions(path.join(sdkRoot, 'ndk'));
  const systemImages = readVersions(path.join(sdkRoot, 'system-images'));
  if (buildTools.length === 0 && apiLevels.length === 0) {
    return null;
  }
  return {
    sdkRoot,
    buildTools,
    apiLevels,
    cmdlineTools,
    ndk,
    systemImages,
  };
}

function getRequiredBuildToolsVersion(projectRoot) {
  const buildGradle = path.join(projectRoot || PROJECT_ROOT, 'android', 'build.gradle');
  if (!fs.existsSync(buildGradle)) return 'Not Found';
  try {
    const text = fs.readFileSync(buildGradle, 'utf8');
    const idx = text.indexOf('buildToolsVersion');
    if (idx === -1) return 'Not Found';
    const line = text.substring(idx).split('\n')[0];
    const m = line.match(/\d+\.\d+\.\d+/);
    return m ? m[0] : 'Not Found';
  } catch (_e) {
    return 'Not Found';
  }
}

function runSdkCheck() {
  const required = getRequiredBuildToolsVersion(PROJECT_ROOT);
  const info = detectAndroidSdkManually(PROJECT_ROOT);

  const okGreen = (t) => `\x1b[32m✓\x1b[0m ${t}`;
  const failRed = (t) => `\x1b[31m✖\x1b[0m ${t}`;
  const dim = (t) => `\x1b[2m${t}\x1b[0m`;

  console.log('');
  console.log('MWRecord Android SDK 自我檢查（不依賴 envinfo）');
  console.log('==============================================');

  if (!info) {
    console.log(failRed('Android SDK - 無法定位 SDK 根目錄'));
    console.log(dim('  請先設定 ANDROID_SDK_ROOT 或在 android/local.properties 填寫 sdk.dir'));
    process.exitCode = 1;
    return 1;
  }

  console.log(`  SDK Root        : ${info.sdkRoot}`);
  console.log(`  API Levels      : ${info.apiLevels.join(', ') || dim('(無)')}`);
  console.log(`  Build Tools     : ${info.buildTools.join(', ') || dim('(無)')}`);
  console.log(`  Command Tools   : ${info.cmdlineTools.join(', ') || dim('(無)')}`);
  console.log(`  NDK             : ${info.ndk.join(', ') || dim('(無)')}`);
  console.log(`  System Images   : ${info.systemImages.join(', ') || dim('(無)')}`);
  console.log(`  Build 需求版號  : buildToolsVersion ${required}`);

  const hasRequired = Array.isArray(info.buildTools) && info.buildTools.includes(required);
  const hasPlatform = required !== 'Not Found' && info.apiLevels.includes(String(required.split('.')[0]));

  console.log('');
  if (hasRequired && hasPlatform) {
    console.log(okGreen('Android SDK - 所需版本已安裝（Build Tools ' + required + '），doctor 會顯示 PASS 的基礎條件已滿足'));
    console.log(dim('  提示：envinfo 在非標準 SDK 路徑可能仍回報 Not Found，可忽略，繼續 run-android 即可'));
    return 0;
  }
  if (!hasRequired) {
    console.log(
      failRed(
        `Android SDK - 缺少 build-tools;${required}（您有的版本：${
          info.buildTools.length ? info.buildTools.join(', ') : '無'
        }）`
      )
    );
  }
  if (!hasPlatform) {
    console.log(
      failRed(
        `Android SDK - 缺少 platforms;android-${required.split('.')[0]}（您有的版本：${
          info.apiLevels.length ? info.apiLevels.join(', ') : '無'
        }）`
      )
    );
  }
  process.exitCode = 1;
  return 1;
}

if (require.main === module) {
  runSdkCheck();
}

module.exports = {
  detectAndroidSdkManually,
  getRequiredBuildToolsVersion,
  runSdkCheck,
};
