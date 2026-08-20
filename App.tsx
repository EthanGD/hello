import React, {Component, type ReactNode} from 'react';
import {StatusBar, StyleSheet, View, Text} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Provider as AntdProvider} from '@ant-design/react-native';
import {AppProvider} from './src/context/AppContext';
import {AppNavigator} from './src/navigation/AppNavigator';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {hasError: false};
  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return {hasError: true, message: err?.message || String(err)};
  }
  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary]', error, info);
  }
  handleRetry = () => this.setState({hasError: false, message: undefined});
  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.title}>發生異常</Text>
          <Text style={ebStyles.msg}>{this.state.message || '未知錯誤'}</Text>
          <Text style={ebStyles.retry} onPress={this.handleRetry}>
            重試
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
  retry: {marginTop: 24, color: '#1677ff', fontSize: 16, fontWeight: '600'},
});

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <AntdProvider>
            <AppProvider>
              <StatusBar barStyle="light-content" backgroundColor="#1677ff" />
              <AppNavigator />
            </AppProvider>
          </AntdProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
});

export default App;
