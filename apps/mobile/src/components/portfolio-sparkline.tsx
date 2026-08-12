import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Colors } from '@/constants/theme';

const palette = Colors.dark;
const STROKE_WIDTH = 2;
const END_DOT_RADIUS = 4;

type PortfolioSparklineProps = {
  values: number[];
  height?: number;
};

/**
 * A thin connected line chart built from rotated hairline Views — there is no
 * chart/SVG dependency in this project, and adding one is out of scope for a
 * UI prototype. Each segment is a straight rotated bar between two points;
 * small dots at each joint hide the seams so the polyline reads as one line.
 */
export function PortfolioSparkline({ values, height = 56 }: PortfolioSparklineProps) {
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const points =
    width > 0
      ? values.map((value, index) => ({
          x: (index / (values.length - 1)) * width,
          y: height - value * height,
        }))
      : [];

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {points.map((point, index) => {
        if (index === points.length - 1) {
          return (
            <View
              key="end-dot"
              style={[
                styles.endDot,
                { left: point.x - END_DOT_RADIUS, top: point.y - END_DOT_RADIUS },
              ]}
            />
          );
        }

        const next = points[index + 1];
        const dx = next.x - point.x;
        const dy = next.y - point.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

        return (
          <View
            key={index}
            style={[
              styles.segment,
              {
                width: length,
                left: point.x,
                top: point.y - STROKE_WIDTH / 2,
                transform: [{ rotate: `${angle}deg` }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  segment: {
    position: 'absolute',
    height: STROKE_WIDTH,
    backgroundColor: palette.accentGold,
    borderRadius: STROKE_WIDTH / 2,
    transformOrigin: 'left center',
  },
  endDot: {
    position: 'absolute',
    width: END_DOT_RADIUS * 2,
    height: END_DOT_RADIUS * 2,
    borderRadius: END_DOT_RADIUS,
    backgroundColor: palette.accentGold,
  },
});
