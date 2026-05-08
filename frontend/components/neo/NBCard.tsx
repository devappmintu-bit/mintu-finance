/**
 * NBCard — chunky Memphis-Group card with hard shadow.
 *
 * Optional sticker corners (rotated badge) and hanging tag for that
 * "this card was glued on" energy. All theme-aware.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useNeoPalette } from '../../store/neoTheme';
import { NB_BORDER, NB_RADIUS, NB_ROTATE, NB_SPACE, NB_TYPE, NeoRole, roleColor } from '../../utils/neoBrutalism';

type Props = {
  children: React.ReactNode;
  role?: NeoRole;        // background role color
  shadow?: 'sm' | 'md' | 'lg';
  /** Optional sticker badge in top-right corner (rotated). */
  sticker?: { text: string; tone?: NeoRole };
  onPress?: () => void;
  style?: ViewStyle;
  padding?: keyof typeof NB_SPACE;
  tilt?: keyof typeof NB_ROTATE;
};

export default function NBCard({
  children, role = 'neutral', shadow = 'md', sticker, onPress, style, padding = 'lg', tilt,
}: Props) {
  const palette = useNeoPalette();
  const r = roleColor(palette, role);
  const offset = shadow === 'sm' ? 3 : shadow === 'md' ? 5 : 7;

  const Container: any = onPress ? Pressable : View;

  return (
    <View style={[{ position: 'relative', alignSelf: 'stretch' }, style, tilt ? { transform: [{ rotateZ: NB_ROTATE[tilt] }] } : null]}>
      {/* Hard shadow plate */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: offset, top: offset, right: -offset, bottom: -offset,
          backgroundColor: palette.ink,
          borderRadius: NB_RADIUS.md,
        }}
      />
      <Container
        onPress={onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        style={({ pressed }: any) => [
          {
            backgroundColor: r.bg,
            borderColor: palette.ink,
            borderWidth: NB_BORDER.medium,
            borderRadius: NB_RADIUS.md,
            padding: NB_SPACE[padding],
          },
          onPress && pressed ? { transform: [{ translateX: offset / 2 }, { translateY: offset / 2 }] } : null,
        ]}
      >
        {children}
      </Container>

      {sticker ? <CardSticker text={sticker.text} tone={sticker.tone || 'rewards'} /> : null}
    </View>
  );
}

function CardSticker({ text, tone }: { text: string; tone: NeoRole }) {
  const palette = useNeoPalette();
  const r = roleColor(palette, tone);
  return (
    <View
      pointerEvents="none"
      style={[
        stickerStyles.wrap,
        {
          backgroundColor: r.bg,
          borderColor: palette.ink,
          transform: [{ rotateZ: NB_ROTATE.tilt4 }],
        },
      ]}
    >
      <Text style={[NB_TYPE.loud, { color: r.ink }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const stickerStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -10,
    right: -8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: NB_BORDER.thin,
    borderRadius: NB_RADIUS.sm,
    zIndex: 2,
  },
});
