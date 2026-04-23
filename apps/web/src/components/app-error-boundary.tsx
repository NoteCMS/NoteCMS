import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LoadErrorAlert } from '@/components/load-error-alert';

type Props = { children: ReactNode };

type State = { hasError: boolean; error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex min-h-svh items-center justify-center bg-muted p-4">
          <div className="w-full max-w-md">
            <LoadErrorAlert
              title="This screen crashed"
              message={this.state.error.message || 'An unexpected error occurred. You can reload the app to continue.'}
              onRetry={() => window.location.reload()}
              retryLabel="Reload page"
            />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
