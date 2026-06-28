declare module 'react-native-webview' {
    import { Component } from 'react';
    import { ViewProps } from 'react-native';

    interface WebViewSourceUri {
        uri: string;
        headers?: Record<string, string>;
    }

    interface WebViewProps extends ViewProps {
        source?: WebViewSourceUri | { html: string };
        allowsFullscreenVideo?: boolean;
        mediaPlaybackRequiresUserAction?: boolean;
        startInLoadingState?: boolean;
        renderLoading?: () => React.ReactNode;
        style?: any;
    }

    export class WebView extends Component<WebViewProps> {}
}
