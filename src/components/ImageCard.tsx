import React from 'react';
import {Image, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import type {ImageMeta} from '../types';
import {formatDate} from '../utils/date';

interface ImageCardProps {
  image: ImageMeta;
  onPress?: () => void;
}

export const ImageCard: React.FC<ImageCardProps> = ({image, onPress}) => {
  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.card} onPress={onPress}>
      <Image
        source={{uri: `file://${image.filePath}?v=${image.updatedAt}`}}
        style={styles.image}
        resizeMode="cover"
      />
      <View style={styles.overlay}>
        <Text style={styles.date}>
          {formatDate(image.createdAt).split(' ')[0]}
          {image.hasWatermark ? ' · 已標記' : ''}
        </Text>
        {image.location ? (
          <Text
            style={styles.locationText}
            numberOfLines={1}
            ellipsizeMode="tail">
            📍 {image.location}
          </Text>
        ) : null}
        {image.remark ? (
          <Text
            style={styles.remarkText}
            numberOfLines={2}
            ellipsizeMode="tail">
            {image.remark}
          </Text>
        ) : null}
        {image.fileName ? (
          <Text style={styles.fileNameText} numberOfLines={1} ellipsizeMode="middle">
            📎 {image.fileName}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1,
    backgroundColor: '#eee',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {width: '100%', height: '100%', backgroundColor: '#ddd'},
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  locationText: {fontSize: 11, color: '#fff', marginBottom: 2},
  remarkText: {fontSize: 11, color: '#fff', lineHeight: 14},
  fileNameText: {fontSize: 10, color: 'rgba(255,255,255,0.85)', marginTop: 3},
  date: {fontSize: 10, color: '#fff', marginBottom: 2},
});
