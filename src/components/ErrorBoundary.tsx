import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangleIcon, RefreshCwIcon } from 'lucide-react';
import { reportClientError } from '../utils/reportClientError';

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
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
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
              We hit an unexpected problem, but the app is still here. Try again, or reload if this page looks stuck.
            </p>
            <p className="text-xs text-charcoal-400 mb-4">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white hover:bg-teal-600 transition-colors"
              >
                <RefreshCwIcon className="w-4 h-4" />
                Try again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-300 text-charcoal hover:bg-surface-50 transition-colors"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
