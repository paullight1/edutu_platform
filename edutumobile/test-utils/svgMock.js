// A complete-enough `react-native-svg` stand-in for jest.
//
// Suites used to hand-roll `{ SvgXml }` because that was the only export their
// screens touched. The shared illustrated-state system changed that:
// `components/state/SceneRenderer` imports the default `Svg` plus Circle/G/
// Path/Rect and feeds `G` to `Animated.createAnimatedComponent`. A partial mock
// leaves those `undefined`, and React reports the module object itself —
// "Element type is invalid ... got: object. Check the render method of
// SceneRenderer" — which reads as a SceneRenderer bug rather than a mock gap.
//
// Use it wholesale:
//   jest.mock('react-native-svg', () => require('../test-utils/svgMock'));
const React = require('react');
const { View, Text } = require('react-native');

const shape = (name) => {
  const Component = (props) => React.createElement(View, props, props && props.children);
  Component.displayName = name;
  return Component;
};

const Svg = shape('Svg');

module.exports = {
  __esModule: true,
  default: Svg,
  Svg,
  SvgXml: ({ xml }) => React.createElement(Text, null, xml ? 'SvgXml' : 'SvgXmlEmpty'),
  Circle: shape('Circle'),
  Ellipse: shape('Ellipse'),
  G: shape('G'),
  Line: shape('Line'),
  Path: shape('Path'),
  Polygon: shape('Polygon'),
  Polyline: shape('Polyline'),
  Rect: shape('Rect'),
  Text: shape('SvgText'),
  TSpan: shape('TSpan'),
  TextPath: shape('TextPath'),
  Use: shape('Use'),
  Defs: shape('Defs'),
  Stop: shape('Stop'),
  LinearGradient: shape('LinearGradient'),
  RadialGradient: shape('RadialGradient'),
  ClipPath: shape('ClipPath'),
  Mask: shape('Mask'),
  Pattern: shape('Pattern'),
  Image: shape('SvgImage'),
  Symbol: shape('Symbol'),
  Marker: shape('Marker'),
  ForeignObject: shape('ForeignObject'),
};
