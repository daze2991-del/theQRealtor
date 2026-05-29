import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RealtQR from "../RealtQR.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RealtQR />
  </StrictMode>
);
