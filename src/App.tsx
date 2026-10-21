/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LabProvider } from './context/LabContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AppShell } from './components/AppShell.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { MathBubblesPage } from './pages/MathBubblesPage.tsx';
import { MemoryMazePage } from './pages/MemoryMazePage.tsx';
import { PathRotationPage } from './pages/PathRotationPage.tsx';
import { PracticePage } from './pages/PracticePage.tsx';
import { AssessmentPage } from './pages/AssessmentPage.tsx';
import { ResultsPage } from './pages/ResultsPage.tsx';
import { HistoryPage } from './pages/HistoryPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

export function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/games/math-bubbles" element={<MathBubblesPage />} />
        <Route path="/games/memory-maze" element={<MemoryMazePage />} />
        <Route path="/games/path-rotation" element={<PathRotationPage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/assessment" element={<AssessmentPage />} />
        <Route path="/results/:sessionId" element={<ResultsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LabProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </LabProvider>
    </ErrorBoundary>
  );
}
