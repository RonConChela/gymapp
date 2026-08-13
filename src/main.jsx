import "./storage-polyfill.js";
import React from "react";
import { createRoot } from "react-dom/client";
import GymLog from "./gym-log.jsx";
import "./pwa.js";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GymLog />
  </React.StrictMode>
);
