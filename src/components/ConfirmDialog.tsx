import React from 'react';
import {Modal, StyleSheet, Text, View} from 'react-native';
import {Button} from '@ant-design/react-native';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmText = '確定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.footer}>
            <View style={styles.btnWrap}>
              <Button type="ghost" onPress={onCancel}>
                {cancelText}
              </Button>
            </View>
            <View style={styles.btnWrap}>
              <Button type={danger ? 'warning' : 'primary'} onPress={onConfirm}>
                {confirmText}
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  title: {fontSize: 16, fontWeight: '600', color: '#222', marginBottom: 8},
  message: {fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 18},
  footer: {flexDirection: 'row', justifyContent: 'flex-end'},
  btnWrap: {marginLeft: 12, minWidth: 80},
});
