import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../types';

export type DirectoryScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Directory'
>;
export type ImagePreviewScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'ImagePreview'
>;
