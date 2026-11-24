import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ModalLayer } from "./ui";
import ClientPortal from "./ClientPortal";
import "./style.css";
import "./feedback.css";
import "./business.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/portal/") ? (
      <ClientPortal token={window.location.pathname.split("/")[2] ?? ""} />
    ) : (
      <App />
    )}
    <ModalLayer />
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
