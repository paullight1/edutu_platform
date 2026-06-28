import { Image, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface EdutuLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  glow?: boolean;
  frameless?: boolean;
}

export function EdutuLogo({
  size = 72,
  style,
  imageStyle,
  glow = false,
  frameless = false,
}: EdutuLogoProps) {
  if (frameless) {
    return (
      <Image
        source={require('../../assets/logo1.png')}
        resizeMode="contain"
        style={[
          {
            width: size,
            height: size,
          },
          imageStyle,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.frame,
        glow && styles.glow,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
        },
        style,
      ]}
    >
      <Image
        source={require('../../assets/logo1.png')}
        resizeMode="contain"
        style={[
          {
            width: size * 0.74,
            height: size * 0.74,
          },
          imageStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  glow: {
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
});
