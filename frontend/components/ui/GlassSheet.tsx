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
import { StyleSheet, View } from 'react-native';
import BottomSheet, {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
// R100J — Brutalist enforcement: BlurView dropped (no glass).
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  // Round 81 — restyled to Brutalist visuals while keeping the gorhom
  // snap-gesture foundation. Flat paper fill, 3-px ink top border, ink
  // drag-handle. No more glass; just hard edges.
  bg: {
    backgroundColor: c.bg.card,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 3,
    borderColor: c.text.primary,
  },
  handle: {
    backgroundColor: c.text.primary,
    width: 48,
    height: 4,
    borderRadius: 0,
    opacity: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
}));

export type GlassSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  snapPoints?: (string | number)[];
  children?: React.ReactNode;
  onDismiss?: () => void;
};

// R100J — Brutalist enforcement. The legacy BlurView dimmer was the
// last "glass" residue in this primitive (Round 81 already flattened
// the sheet body itself). Replaced with a solid ink scrim — same
// visual hierarchy minus the iOS blur cost. Android already used
// the solid path.
const BlurBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop
    {...props}
    appearsOnIndex={0}
    disappearsOnIndex={-1}
    pressBehavior="close"
    opacity={0.7}
    style={[props.style, StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(10,10,10,0.78)' }]}
  />
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

