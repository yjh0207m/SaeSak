declare module 'react-native-deck-swiper' {
  import {Component} from 'react';
  import {StyleProp, ViewStyle, TextStyle} from 'react-native';

  interface OverlayLabelStyle {
    label?: TextStyle;
    wrapper?: ViewStyle;
  }

  interface OverlayLabel {
    title?: string;
    element?: React.ReactNode;
    style?: OverlayLabelStyle;
  }

  interface SwiperProps<T> {
    cards: T[];
    renderCard: (card: T, index: number) => React.ReactNode;
    keyExtractor?: (card: T) => string;
    onSwiped?: (index: number) => void;
    onSwipedLeft?: (index: number) => void;
    onSwipedRight?: (index: number) => void;
    onSwipedTop?: (index: number) => void;
    onSwipedBottom?: (index: number) => void;
    onSwipedAll?: () => void;
    onTapCard?: (index: number) => void;
    cardIndex?: number;
    infinite?: boolean;
    horizontalSwipe?: boolean;
    verticalSwipe?: boolean;
    disableBottomSwipe?: boolean;
    disableTopSwipe?: boolean;
    disableLeftSwipe?: boolean;
    disableRightSwipe?: boolean;
    stackSize?: number;
    stackSeparation?: number;
    stackScale?: number;
    animateCardOpacity?: boolean;
    animateOverlayLabelsOpacity?: boolean;
    backgroundColor?: string;
    cardHorizontalMargin?: number;
    cardVerticalMargin?: number;
    overlayLabels?: {
      left?: OverlayLabel;
      right?: OverlayLabel;
      top?: OverlayLabel;
      bottom?: OverlayLabel;
    };
    containerStyle?: StyleProp<ViewStyle>;
    cardStyle?: StyleProp<ViewStyle>;
    overlayOpacityHorizontalThreshold?: number;
    overlayOpacityVerticalThreshold?: number;
    swipeAnimationDuration?: number;
  }

  export default class Swiper<T> extends Component<SwiperProps<T>> {
    swipeLeft: (mustDecrementCardIndex?: boolean) => void;
    swipeRight: (mustDecrementCardIndex?: boolean) => void;
    swipeTop: (mustDecrementCardIndex?: boolean) => void;
    swipeBottom: (mustDecrementCardIndex?: boolean) => void;
    swipeBack: (cb?: () => void) => void;
    jumpToCardIndex: (index: number) => void;
  }
}
