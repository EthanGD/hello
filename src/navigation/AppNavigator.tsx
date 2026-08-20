import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../types';
import {DirectoryScreen} from '../screens/DirectoryScreen';
import {ImagePreviewScreen} from '../screens/ImagePreviewScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Directory"
        screenOptions={{
          headerStyle: {backgroundColor: '#1677ff'},
          headerTintColor: '#fff',
          headerTitleStyle: {fontWeight: '600'},
          contentStyle: {backgroundColor: '#f5f6fa'},
        }}>
        <Stack.Screen
          name="Directory"
          component={DirectoryScreen}
          options={{title: 'MWRecord'}}
          initialParams={{directoryId: null}}
        />
        <Stack.Screen
          name="ImagePreview"
          component={ImagePreviewScreen}
          options={{title: '圖片詳情'}}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
