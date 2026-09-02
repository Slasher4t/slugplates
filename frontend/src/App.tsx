import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { GoalsProvider } from "./context/GoalsContext";
import { LogProvider } from "./context/LogContext";
import { MenuSelectionProvider } from "./context/MenuSelectionContext";
import { ThemeProvider } from "./context/ThemeContext";
import { GoalsPage } from "./pages/GoalsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { MenuPage } from "./pages/MenuPage";
import { TodayPage } from "./pages/TodayPage";

export default function App() {
  return (
    <ThemeProvider>
      <GoalsProvider>
        <LogProvider>
          <MenuSelectionProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Navigate to="/menu" replace />} />
                  <Route path="/menu" element={<MenuPage />} />
                  <Route path="/today" element={<TodayPage />} />
                  <Route path="/goals" element={<GoalsPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="*" element={<Navigate to="/menu" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </MenuSelectionProvider>
        </LogProvider>
      </GoalsProvider>
    </ThemeProvider>
  );
}
