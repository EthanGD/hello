// @ts-nocheck
/**
 * @format
 */

import 'react-native-gesture-handler';
import {AppRegistry, LogBox, Platform} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {writeCrashLog, crashLogPath} from './src/utils/crashLog';
import {Toast as AntToast} from '@ant-design/react-native';

(() => {
  try {
    const DEFAULT_DURATION = 0.8;
    const wrapAntToastMethod = (methodName) => {
      const orig = AntToast && AntToast[methodName];
      if (typeof orig !== 'function') return;
      AntToast[methodName] = function patched(content, duration, onClose, mask) {
        const arg2IsFn = typeof duration === 'function';
        const d = arg2IsFn ? DEFAULT_DURATION : (duration == null ? DEFAULT_DURATION : Number(duration));
        const oc = arg2IsFn ? duration : (typeof onClose === 'function' ? onClose : undefined);
        const m = mask == null ? false : !!mask;
        try {
          return orig.call(this, content, d, oc, m);
        } catch (e) {
          try { return orig.call(this, content, d, oc); } catch (_e2) { return undefined; }
        }
      };
    };
    ['success', 'info', 'fail', 'warning', 'offline', 'loading', 'show'].forEach(wrapAntToastMethod);
    void AntToast;
  } catch (_e) {
    // ignore patch fail, fall back to default Ant Toast
  }
})();

void (async () => {
  try {
    const info = {
      ts: Date.now(),
      platform: Platform.OS,
      version: String(Platform.Version || ''),
      logPath: crashLogPath(),
    };
    void writeCrashLog('INFO', 'APP:launch:boot', info);
  } catch (_e) {
    // ignore boot heartbeat
  }
})();

// 捕获全局未处理异常
let origHandler = null;
try {
  origHandler =
    (global.ErrorUtils && typeof global.ErrorUtils.getGlobalHandler === 'function')
      ? global.ErrorUtils.getGlobalHandler()
      : null;
} catch (e) {
  origHandler = null;
}
try {
  const ErrorUtils = global.ErrorUtils;
  if (ErrorUtils && typeof ErrorUtils.setGlobalHandler === 'function') {
    const prev = (current, isFatal) => {
      try {
        void writeCrashLog(
          isFatal ? 'FATAL' : 'ERROR',
          'RN:GlobalError',
          current,
          {isFatal: !!isFatal},
        );
      } catch (_e) { /* ignore */ }
      if (typeof origHandler === 'function') {
        try {
          origHandler(current, isFatal);
        } catch (_e) {
          // ignore
        }
      }
    };
    try {
      ErrorUtils.setGlobalHandler(prev);
    } catch (_e) {
      // ignore
    }
  }
} catch (_e) {
  // ignore
}

// 捕获 unhandled promise rejection
try {
  const anyProcess = global.process;
  if (anyProcess && typeof anyProcess.on === 'function') {
    try {
      anyProcess.on('unhandledRejection', (reason, promise) => {
        void writeCrashLog(
          'FATAL',
          'RN:UnhandledRejection',
          reason,
          {promise: String(promise)},
        );
      });
    } catch (_e) {
      // ignore
    }
  }
} catch (_e) {
  // ignore
}
try {
  const anyAddEventListener = global.addEventListener;
  if (typeof anyAddEventListener === 'function') {
    try {
      anyAddEventListener('unhandledrejection', (event) => {
        void writeCrashLog(
          'FATAL',
          'RN:UnhandledRejection',
          event && event.reason != null ? event.reason : event,
        );
        try {
          if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
          }
        } catch (_e) {
          // ignore
        }
      });
    } catch (_e) {
      // ignore
    }
  }
} catch (_e) {
  // ignore
}

// 捕获 Hermes console 红屏（开发期）
try {
  const originalConsoleError = console.error;
  console.error = function patchedConsoleError(...args) {
    try {
      if (args && args[0] instanceof Error) {
        void writeCrashLog('ERROR', 'ConsoleError', ...args);
      } else if (
        args &&
        args.length &&
        typeof args[0] === 'string' &&
        (args[0].indexOf('Invariant Violation') >= 0 ||
          args[0].indexOf('ErrorBoundary') >= 0 ||
          args[0].indexOf('Exception in HostFunction') >= 0 ||
          args[0].indexOf('TurboModuleRegistry') >= 0)
      ) {
        void writeCrashLog('ERROR', 'ConsoleError', ...args);
      }
    } catch (_e) {
      // ignore
    }
    return originalConsoleError.apply(console, args);
  };
} catch (_e) {
  // ignore
}

// 忽略不影响功能的警告
try {
  if (LogBox && typeof LogBox.ignoreLogs === 'function') {
    LogBox.ignoreLogs([
      'Require cycle:',
      'RCTBridge required',
      'SORA is disabled',
      'the transform cache was reset',
    ]);
  }
} catch (_e) {
  // ignore
}

AppRegistry.registerComponent(appName, () => App);
