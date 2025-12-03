import React, { Component, ErrorInfo, ReactNode } from 'react';
import { FriendlyError } from './FriendlyError';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError && this.state.error) {
            return (
                <>
                    {this.props.children}
                    <FriendlyError
                        error={this.state.error}
                        onDismiss={() => this.setState({ hasError: false, error: null })}
                        lang="es"
                    />
                </>
            );
        }

        return this.props.children;
    }
}
