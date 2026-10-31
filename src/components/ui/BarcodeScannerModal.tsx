import { Ionicons } from '@expo/vector-icons';
import {
  type BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { FormField } from '@/components/ui/FormField';
import { colors, radius, spacing, typography } from '@/constants/theme';

export interface BarcodeScannerModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({
  visible,
  title = 'Ler código de barras',
  subtitle = 'Centralize o código de barras do produto na moldura abaixo',
  onScanned,
  onClose,
}: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      hasScannedRef.current = false;
      setTorchEnabled(false);
      setIsManualMode(false);
      setManualBarcodeInput('');
      setManualError(null);
    }
  }, [visible]);

  function handleBarCodeScanned(result: BarcodeScanningResult): void {
    if (hasScannedRef.current) {
      return;
    }
    const cleaned = (result.data ?? '').trim();
    if (!cleaned) {
      return;
    }
    hasScannedRef.current = true;
    onScanned(cleaned);
  }

  function handleConfirmManualCode(): void {
    const cleaned = manualBarcodeInput.trim().replace(/\s+/g, '');
    if (cleaned.length < 4) {
      setManualError('Digite pelo menos 4 caracteres ou dígitos do código.');
      return;
    }
    hasScannedRef.current = true;
    onScanned(cleaned);
  }

  const isCameraReady = Boolean(permission?.granted) && !isManualMode;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleWrap}>
              <View style={styles.headerIconCircle}>
                <Ionicons
                  name="barcode-outline"
                  size={20}
                  color={colors.primaryDark}
                />
              </View>
              <View style={styles.headerTextCol}>
                <Text style={styles.titleText}>{title}</Text>
                <Text style={styles.subtitleText}>{subtitle}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar leitor"
              onPress={onClose}
              style={styles.closeIconButton}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {isManualMode ? (
            <View style={styles.manualContainer}>
              <FormField
                label="Código de barras / EAN *"
                placeholder="Ex.: 7891024123456"
                keyboardType="numeric"
                leftIcon="barcode-outline"
                autoFocus
                value={manualBarcodeInput}
                errorMessage={manualError ?? undefined}
                helperText="Digite os números impressos abaixo das barras do produto."
                onChangeText={(val) => {
                  setManualBarcodeInput(val);
                  setManualError(null);
                }}
              />

              <View style={styles.actionsCol}>
                <PrimaryButton
                  label="Confirmar código"
                  iconName="checkmark-circle-outline"
                  onPress={handleConfirmManualCode}
                />
                {permission?.granted ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setIsManualMode(false);
                      setManualError(null);
                    }}
                    style={styles.switchModePill}
                  >
                    <Ionicons
                      name="camera-outline"
                      size={16}
                      color={colors.primaryDark}
                    />
                    <Text style={styles.switchModeText}>
                      Voltar para leitura com câmera
                    </Text>
                  </Pressable>
                ) : null}
                <SecondaryButton label="Cancelar" onPress={onClose} />
              </View>
            </View>
          ) : isCameraReady ? (
            <View style={styles.scannerBody}>
              <View style={styles.cameraWrapper}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torchEnabled}
                  barcodeScannerSettings={{
                    barcodeTypes: [
                      'ean13',
                      'ean8',
                      'upc_a',
                      'upc_e',
                      'code128',
                      'code39',
                      'itf14',
                      'codabar',
                      'qr',
                    ],
                  }}
                  onBarcodeScanned={handleBarCodeScanned}
                />

                {/* Top overlay controls (Lanterna + formato) */}
                <View style={styles.cameraTopOverlay}>
                  <View style={styles.formatBadge}>
                    <Ionicons
                      name="scan-outline"
                      size={13}
                      color={colors.white}
                    />
                    <Text style={styles.formatBadgeText}>
                      EAN-13 • EAN-8 • UPC • Code128
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      torchEnabled ? 'Desligar lanterna' : 'Ligar lanterna'
                    }
                    onPress={() => setTorchEnabled((prev) => !prev)}
                    style={[
                      styles.torchButton,
                      torchEnabled ? styles.torchButtonActive : null,
                    ]}
                  >
                    <Ionicons
                      name={
                        torchEnabled ? 'flashlight' : 'flashlight-outline'
                      }
                      size={16}
                      color={colors.white}
                    />
                    <Text style={styles.torchButtonText}>
                      {torchEnabled ? 'Lanterna ON' : 'Lanterna'}
                    </Text>
                  </Pressable>
                </View>

                {/* Viewfinder Frame */}
                <View style={styles.viewfinderCenter}>
                  <View style={styles.viewfinderBox}>
                    <View style={[styles.corner, styles.cornerTopLeft]} />
                    <View style={[styles.corner, styles.cornerTopRight]} />
                    <View style={[styles.corner, styles.cornerBottomLeft]} />
                    <View style={[styles.corner, styles.cornerBottomRight]} />
                    <View style={styles.laserLine} />
                  </View>
                </View>

                <View style={styles.cameraBottomOverlay}>
                  <Text style={styles.cameraHintText}>
                    Mantenha o celular a ~15 cm do código para focar
                  </Text>
                </View>
              </View>

              <View style={styles.footerActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsManualMode(true)}
                  style={styles.switchModePill}
                >
                  <Ionicons
                    name="keypad-outline"
                    size={16}
                    color={colors.primaryDark}
                  />
                  <Text style={styles.switchModeText}>
                    Código ilegível? Digitar manualmente
                  </Text>
                </Pressable>

                <SecondaryButton label="Cancelar" onPress={onClose} />
              </View>
            </View>
          ) : (
            <View style={styles.permissionContainer}>
              <View style={styles.permissionIconBox}>
                <Ionicons
                  name="camera-outline"
                  size={34}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.permissionTitle}>
                Acesso à câmera necessário
              </Text>
              <Text style={styles.permissionDesc}>
                Autorize o uso da câmera para ler códigos de barras de produtos
                automaticamente.
              </Text>

              <View style={styles.actionsCol}>
                <PrimaryButton
                  label="Permitir câmera"
                  iconName="camera-outline"
                  onPress={() => {
                    void requestPermission();
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsManualMode(true)}
                  style={styles.switchModePill}
                >
                  <Ionicons
                    name="keypad-outline"
                    size={16}
                    color={colors.primaryDark}
                  />
                  <Text style={styles.switchModeText}>
                    Digitar código manualmente
                  </Text>
                </Pressable>
                <SecondaryButton label="Cancelar" onPress={onClose} />
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 24, 21, 0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTextCol: {
    flex: 1,
    gap: 2,
  },
  titleText: {
    ...typography.section,
    color: colors.text,
  },
  subtitleText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  closeIconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerBody: {
    gap: spacing.md,
  },
  cameraWrapper: {
    width: '100%',
    height: 290,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: '#0F1815',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  cameraTopOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  formatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 24, 21, 0.72)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  formatBadgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },
  torchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 24, 21, 0.72)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  torchButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  torchButtonText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  viewfinderCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  viewfinderBox: {
    width: '100%',
    maxWidth: 260,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: '#20C997',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: radius.sm,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: radius.sm,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: radius.sm,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: radius.sm,
  },
  laserLine: {
    width: '88%',
    height: 2,
    backgroundColor: '#20C997',
    opacity: 0.85,
    borderRadius: 2,
  },
  cameraBottomOverlay: {
    backgroundColor: 'rgba(15, 24, 21, 0.72)',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  cameraHintText: {
    ...typography.caption,
    color: colors.white,
    textAlign: 'center',
  },
  footerActions: {
    gap: spacing.sm,
  },
  switchModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  switchModeText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  permissionContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  permissionIconBox: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  permissionTitle: {
    ...typography.section,
    color: colors.text,
    textAlign: 'center',
  },
  permissionDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  manualContainer: {
    gap: spacing.md,
  },
  actionsCol: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
});
