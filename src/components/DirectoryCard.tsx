import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Icon} from '@ant-design/react-native';
import type {DirectoryNode} from '../types';

interface DirectoryCardProps {
  directory: DirectoryNode;
  imageCount?: number;
  onPress?: () => void;
  onLongPress?: () => void;
}

export const DirectoryCard: React.FC<DirectoryCardProps> = ({
  directory,
  imageCount = 0,
  onPress,
  onLongPress,
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}>
      <View style={styles.iconWrap}>
        <Icon name="folder" size={40} color="#F5A623" />
      </View>
      <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
        {directory.name}
      </Text>
      <Text style={styles.meta}>
        <Icon name="picture" size={12} /> {imageCount}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  iconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    color: '#222',
    textAlign: 'center',
    width: '100%',
    minHeight: 36,
  },
  meta: {marginTop: 4, fontSize: 12, color: '#888'},
});
