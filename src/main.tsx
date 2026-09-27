import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CwPlatform from "../app/CwPlatform";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root is missing");
}

createRoot(root).render(
  <StrictMode>
    <CwPlatform />
  </StrictMode>,
);
