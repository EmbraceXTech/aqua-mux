import { PrivyProvider } from "@privy-io/react-auth";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OwnerPoc } from "./owner-poc";
import "./styles.css";

const appId = import.meta.env.VITE_PRIVY_APP_ID as string;
const clientId = import.meta.env.VITE_PRIVY_CLIENT_ID as string;

if (!appId || !clientId) throw new Error("The local POC client configuration is unavailable.");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider appId={appId} clientId={clientId}>
      <OwnerPoc />
    </PrivyProvider>
  </StrictMode>,
);
