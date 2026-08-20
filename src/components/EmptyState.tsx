import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Icon} from '@ant-design/react-native';
import type {IconNames} from '@ant-design/react-native/lib/icon';

interface EmptyStateProps {
  icon?: IconNames;
  title: string;
  description?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'inbox' as IconNames,
  title,
  description,
}) => {
  return (
    <View style={styles.container}>
      <Icon name={icon} size={64} color="#bbb" />
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  title: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  desc: {
    marginTop: 8,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
});
