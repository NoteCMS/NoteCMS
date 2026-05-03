import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LoadErrorAlert } from '@/components/load-error-alert';

type Props = { children: ReactNode };

type State = { hasError: boolean; error: Error | null };

/**
 * Catches render errors inside the GitHub builds sheet so the rest of Site settings keeps working.
 */
export class DeploySheetErrorBoundary extends Component<Props, State> {
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
        <LoadErrorAlert
          compact
          title="This panel crashed"
          message={
            this.state.error.message || 'Something unexpected happened in the build panel. You can try again or close it.'
          }
          onRetry={() => this.setState({ hasError: false, error: null })}
          retryLabel="Try again"
        />
      );
    }
    return this.props.children;
  }
}
