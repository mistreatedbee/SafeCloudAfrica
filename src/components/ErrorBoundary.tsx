import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangleIcon, RefreshCwIcon } from 'lucide-react';
import { reportClientError } from '../utils/reportClientError';
import { paaq } from '../lib/paaq';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
    reportClientError({
      module: 'ErrorBoundary',
      error,
      componentStack: errorInfo.componentStack
    });
    paaq.trackError(error, {
      severity: 'fatal',
      context: errorInfo.componentStack ? { componentStack: errorInfo.componentStack } : undefined
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[40vh] flex items-center justify-center p-8 bg-surface-50">
          <div className="max-w-md w-full text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangleIcon className="w-16 h-16 text-critical" aria-hidden />
            </div>
            <h2 className="text-xl font-semibold text-charcoal mb-2">Something went wrong</h2>
            <p className="text-charcoal-500 mb-4 text-sm">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white hover:bg-teal-600 transition-colors"
            >
              <RefreshCwIcon className="w-4 h-4" />
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
