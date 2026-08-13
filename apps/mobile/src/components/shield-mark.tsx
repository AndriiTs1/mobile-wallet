import { Image } from 'react-native';

const SHIELD_ASPECT_RATIO = 810 / 686; // height / width, matches the source artwork

type ShieldMarkProps = {
  size?: number;
};

export function ShieldMark({ size = 28 }: ShieldMarkProps) {
  return (
    <Image
      source={require('@/assets/images/shield-mark.png')}
      style={{ width: size, height: size * SHIELD_ASPECT_RATIO }}
      resizeMode="contain"
    />
  );
}
