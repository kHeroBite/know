import React, { Component, ReactNode } from 'react';
import { Button, Result } from 'antd';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="오류가 발생했습니다"
          subTitle={this.state.error?.message || '알 수 없는 오류'}
          extra={<Button type="primary" onClick={() => this.setState({ hasError: false, error: null })}>다시 시도</Button>}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
