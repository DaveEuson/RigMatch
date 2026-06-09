import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: "#f00", background: "#1a0000", fontFamily: "monospace", height: "100vh" }}>
          <h2 style={{ color: "#ff6060", marginBottom: 16 }}>App crashed</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#cc4444", marginTop: 12 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
