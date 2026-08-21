import React, {useEffect, useState} from 'react';
import {Modal, StyleSheet, Text, TextInput, View} from 'react-native';
import {Button} from '@ant-design/react-native';

interface InputModalProps {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  maxLength?: number;
  multiline?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => Promise<void> | void;
  onCancel: () => void;
}

export const InputModal: React.FC<InputModalProps> = ({
  visible,
  title,
  placeholder = '請輸入',
  initialValue = '',
  maxLength,
  multiline = false,
  confirmText = '確定',
  cancelText = '取消',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
    }
  }, [visible, initialValue]);

  const handleConfirm = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(value);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={[styles.input, multiline && styles.inputMultiline]}
            placeholder={placeholder}
            placeholderTextColor="#bbb"
            value={value}
            onChangeText={setValue}
            maxLength={maxLength}
            multiline={multiline}
            autoFocus
          />
          <View style={styles.footer}>
            <View style={styles.btnWrap}>
              <Button type="ghost" onPress={onCancel} disabled={submitting}>
                {cancelText}
              </Button>
            </View>
            <View style={styles.btnWrap}>
              <Button
                type="primary"
                onPress={handleConfirm}
                disabled={submitting || value.trim().length === 0}
                loading={submitting}>
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
    backgroundColor: 'rgba(0,0,0,0.28)',
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
  title: {fontSize: 16, fontWeight: '600', color: '#222', marginBottom: 16},
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#222',
    minHeight: 44,
  },
  inputMultiline: {minHeight: 100, textAlignVertical: 'top'},
  footer: {marginTop: 18, flexDirection: 'row', justifyContent: 'flex-end'},
  btnWrap: {marginLeft: 12, minWidth: 80},
});
