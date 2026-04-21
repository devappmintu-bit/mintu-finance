/**
 * GlassSheet — canonical glassmorphism bottom-sheet wrapper.
 *
 * Built on @gorhom/bottom-sheet for real snap-gesture UX + performant backdrop
 * blur. Provides:
 *   • Snap points (e.g. [40%, 90%])
 *   • Blur backdrop that dismisses on tap
 *   • Dark elevated surface with subtle top-rim border
 *   • Orange drag-handle
 *   • Auto-dismissable via ref.close()
 *   • Safe-area aware on iOS
 *
 * Usage (imperative):
 *   const sheetRef = useRef<GlassSheetHandle>(null);
 *   <GlassSheet ref={sheetRef} snapPoints={['45%', '88%']}>
 *     …content…
 *   </GlassSheet>
 *   // open: sheetRef.current?.present();  close: sheetRef.current?.dismiss();
 */
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import BottomSheet, {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

export type GlassSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  snapPoints?: (string | number)[];
  children?: React.ReactNode;
  onDismiss?: () => void;
};

const BlurBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop
    {...props}
    appearsOnIndex={0}
    disappearsOnIndex={-1}
    pressBehavior="close"
    opacity={0.7}
    style={[props.style, StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
  >
    {Platform.OS !== 'android' ? (
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFillObject} />
    ) : null}
  </BottomSheetBackdrop>
);

const GlassSheet = forwardRef<GlassSheetHandle, Props>(({ snapPoints = ['50%', '90%'], children, onDismiss }, ref) => {
  const styles = useStyles();
  const modalRef = useRef<BottomSheetModal>(null);

  useImperativeHandle(ref, () => ({
    present: () => modalRef.current?.present(),
    dismiss: () => modalRef.current?.dismiss(),
  }));

  const handlePoints = useMemo(() => snapPoints, [snapPoints]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => <BlurBackdrop {...props} />, []);

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={handlePoints as any}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
      onDismiss={onDismiss}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetView style={styles.content}>
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

GlassSheet.displayName = 'GlassSheet';
export default GlassSheet;

const useStyles = makeStyles((c) => ({
  bg: {
    backgroundColor: c.bg.elevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    backgroundColor: c.accent.primary,
    width: 48,
    height: 4,
    borderRadius: 2,
    opacity: 0.9,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
}));
