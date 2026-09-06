import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import CoolBarDesk from "./coolbar-desk"
import { ThemeProvider } from "./components/theme-provider"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="coolbar-desk-theme">
      <CoolBarDesk />
    </ThemeProvider>
  </StrictMode>
)
