import React, {Component, type ReactNode, useCallback, useState, useRef} from 'react';
import {
  Alert,
  Clipboard,
  Linking,
  StatusBar,
  StyleSheet,
  View,
  Text,
  ScrollView,
} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Provider as AntdProvider, Toast as AntToast} from '@ant-design/react-native';
import {AppProvider} from './src/context/AppContext';
import {AppNavigator} from './src/navigation/AppNavigator';
import {readCrashLog, writeCrashLog, crashLogPath} from './src/utils/crashLog';

interface ErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
  stack?: string;
  log?: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {hasError: false};
  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: err?.message || String(err),
      stack: err?.stack,
    };
  }
  componentDidCatch(error: Error, info: any) {
    void writeCrashLog('FATAL', 'ErrorBoundary', error, info);
  }
  handleRetry = () => {
    this.setState({
      hasError: false,
      message: undefined,
      stack: undefined,
      log: undefined,
    });
    try {
      if (typeof this.props.onRetry === 'function') {
        this.props.onRetry();
      }
    } catch {
      // ignore
    }
  };
  handleReadLog = async () => {
    try {
      const log = await readCrashLog(120);
      this.setState({log});
    } catch (err) {
      this.setState({log: '讀取崩潰日誌失敗: ' + String(err)});
    }
  };
  handleCopyAll = async () => {
    try {
      const log = this.state.log || (await readCrashLog(200));
      const text =
        `Message: ${this.state.message || ''}\n` +
        `Stack: ${this.state.stack || ''}\n` +
        `--- recent crash log ---\n${log || ''}\n` +
        `logPath: ${crashLogPath()}`;
      await Clipboard.setString(text);
      Alert.alert('已複製', '崩潰信息已複製到剪貼板，請粘貼給開發者');
    } catch (err) {
      Alert.alert('複製失敗', String(err));
    }
  };
  handleOpenSettings = () => {
    Linking.openSettings().catch(() => undefined);
  };
  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.title}>發生異常</Text>
          <Text style={ebStyles.msg} numberOfLines={8}>
            {this.state.message || '未知錯誤'}
          </Text>
          <ScrollView style={ebStyles.stackBox}>
            <Text selectable style={ebStyles.stackText}>
              {this.state.log
                ? this.state.log
                : this.state.stack || '點擊下方「查看崩潰日誌」取得更多信息'}
            </Text>
          </ScrollView>
          <View style={ebStyles.row}>
            <Text style={ebStyles.btnPrimary} onPress={this.handleRetry}>
              重試
            </Text>
            <Text style={ebStyles.btnGhost} onPress={this.handleReadLog}>
              查看崩潰日誌
            </Text>
            <Text style={ebStyles.btnGhost} onPress={this.handleCopyAll}>
              複製
            </Text>
            <Text style={ebStyles.btnGhost} onPress={this.handleOpenSettings}>
              權限設置
            </Text>
          </View>
          <Text style={ebStyles.logPath}>
            log file: {crashLogPath()}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const ebStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  title: {fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12},
  msg: {fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20},
  stackBox: {
    marginTop: 12,
    maxHeight: 220,
    width: '100%',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f7f7f7',
  },
  stackText: {fontSize: 11, color: '#333', lineHeight: 16},
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    gap: 8,
  },
  btnPrimary: {
    marginHorizontal: 6,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1677ff',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    overflow: 'hidden',
  },
  btnGhost: {
    marginHorizontal: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    backgroundColor: '#fff',
    color: '#262626',
    fontSize: 13,
    fontWeight: '600',
    overflow: 'hidden',
  },
  logPath: {
    marginTop: 18,
    fontSize: 10,
    color: '#8c8c8c',
    textAlign: 'center',
  },
});

function App(): React.JSX.Element {
  const [retryVersion, forceUpdate] = useState(0);
  void retryVersion;
  const hideToastAt = useRef(0);
  const dismissToastNow = useCallback(() => {
    const now = Date.now();
    if (now - hideToastAt.current < 40) return;
    hideToastAt.current = now;
    try { (AntToast as any).hide?.(); } catch { /* ignore */ }
  }, []);
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary key={`app-eb-${retryVersion}`} onRetry={() => forceUpdate(n => n + 1)}>
        <SafeAreaProvider>
          <AntdProvider>
            <AppProvider>
              <StatusBar barStyle="light-content" backgroundColor="#1677ff" />
              <View
                style={styles.rootFill}
                onTouchStart={dismissToastNow}
                onStartShouldSetResponderCapture={() => {
                  dismissToastNow();
                  return false;
                }}>
                <AppNavigator />
              </View>
            </AppProvider>
          </AntdProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  rootFill: {flex: 1},
});

export default App;
