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
        source={{uri: `file://${image.filePath}`}}
        style={styles.image}
        resizeMode="cover"
      />
      <View style={styles.overlay}>
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
        <Text style={styles.date}>
          {formatDate(image.createdAt).split(' ')[0]}
        </Text>
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
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  locationText: {fontSize: 11, color: '#fff', marginBottom: 2},
  remarkText: {fontSize: 11, color: '#fff', lineHeight: 14},
  date: {position: 'absolute', top: -60, right: 4, fontSize: 10, color: '#fff'},
});
