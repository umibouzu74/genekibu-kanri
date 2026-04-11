import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ToastContainer";
import { ToastProvider } from "./hooks/useToasts";
import { ConfirmProvider } from "./hooks/useConfirm";
import { tokensToCss } from "./styles/tokens";

// Inject design tokens as CSS custom properties so stylesheets can
// reference them. Kept as an inline <style> tag to avoid adding a
// separate CSS build step.
const tokenStyle = document.createElement("style");
tokenStyle.setAttribute("data-tokens", "design");
tokenStyle.textContent = tokensToCss();
document.head.appendChild(tokenStyle);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider
        render={(toasts, dismiss) => (
          <ToastContainer toasts={toasts} onDismiss={dismiss} />
        )}
      >
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
