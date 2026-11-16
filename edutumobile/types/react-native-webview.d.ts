declare module 'react-native-webview' {
    import { Component } from 'react';
    import { ViewProps } from 'react-native';

    interface WebViewSourceUri {
        uri: string;
        headers?: Record<string, string>;
    }

    interface WebViewMessageEvent {
        nativeEvent: { data: string };
    }

    interface WebViewProps extends ViewProps {
        source?: WebViewSourceUri | { html: string };
        allowsFullscreenVideo?: boolean;
        mediaPlaybackRequiresUserAction?: boolean;
        startInLoadingState?: boolean;
        renderLoading?: () => React.ReactNode;
        style?: any;
        originWhitelist?: string[];
        scrollEnabled?: boolean;
        overScrollMode?: 'always' | 'content' | 'never';
        bounces?: boolean;
        javaScriptEnabled?: boolean;
        domStorageEnabled?: boolean;
        androidLayerType?: 'none' | 'software' | 'hardware';
        setBuiltInZoomControls?: boolean;
        injectedJavaScript?: string;
        onMessage?: (event: WebViewMessageEvent) => void;
        onLoadEnd?: () => void;
    }

    export class WebView extends Component<WebViewProps> {
        injectJavaScript: (script: string) => void;
        postMessage: (message: string) => void;
        reload: () => void;
    }
}
