import { StyleSheet, View } from 'react-native';

type ShieldMarkProps = {
  size?: number;
};

const SWISS_RED = '#C1272D';

export function ShieldMark({ size = 28 }: ShieldMarkProps) {
  const barLength = size * 0.5;
  const barThickness = size * 0.14;

  return (
    <View
      style={[
        styles.shield,
        {
          width: size,
          height: size,
          borderTopLeftRadius: size * 0.32,
          borderTopRightRadius: size * 0.32,
          borderBottomLeftRadius: size * 0.14,
          borderBottomRightRadius: size * 0.14,
        },
      ]}>
      <View
        style={[
          styles.bar,
          { width: barLength, height: barThickness, borderRadius: barThickness * 0.3 },
        ]}
      />
      <View
        style={[
          styles.bar,
          styles.barVertical,
          { width: barThickness, height: barLength, borderRadius: barThickness * 0.3 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shield: {
    backgroundColor: SWISS_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    backgroundColor: '#ffffff',
  },
  barVertical: {
    position: 'absolute',
  },
});
