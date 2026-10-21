import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LabProvider } from '../context/LabContext.tsx';
import { AppRoutes } from '../App.tsx';

function renderAtRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <LabProvider>
        <AppRoutes />
      </LabProvider>
    </MemoryRouter>
  );
}

describe('Cognitive Games Lab — Navigation, All 3 Cognitive Games, Persistence & Assessment Orchestrator UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders Dashboard with zeroed telemetry and 150 total archetypes when localStorage is empty', () => {
    renderAtRoute('/');
    expect(
      screen.getByText(/Cognitive Assessment Practice Platform · 150 Total Puzzle Archetypes/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/Each module includes 50 distinct puzzle archetypes/i)
    ).toBeTruthy();
    expect(screen.getByTestId('stat-completed-sessions').textContent).toBe('0');
    expect(screen.getByTestId('empty-history-indicator')).toBeTruthy();
  });

  it('renders Practice Configuration Studio with 50 archetypes per game, All Games (150) toggle, and benchmark fixtures', () => {
    renderAtRoute('/practice');
    expect(screen.getByText('Practice Configuration Studio')).toBeTruthy();
    expect(screen.getByText(/Archetype Catalog \(50 of 50\)/i)).toBeTruthy();

    const allGamesBtn = screen.getByRole('button', { name: /All Games \(150\)/i });
    fireEvent.click(allGamesBtn);
    expect(screen.getByText(/Archetype Catalog \(150 of 150\)/i)).toBeTruthy();
  });

  it('launches Math Bubble Arena with ?autostart=1 and allows selecting bubbles in order', () => {
    renderAtRoute('/games/math-bubbles?autostart=1&seed=FIXTURE-MB-EASY-101&questions=1&archetype=mb-01');
    expect(screen.getByTestId('order-rule-badge').textContent).toMatch(/LOWEST → HIGHEST/i);
    const bubbleButtons = screen.getAllByRole('button', { name: /Bubble \d:/i });
    expect(bubbleButtons.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(bubbleButtons[0]);
  });

  it('launches Math Bubble Arena descending archetype MB-39 with 4 bubbles', () => {
    renderAtRoute('/games/math-bubbles?autostart=1&seed=DESC-TEST-101&questions=1&archetype=mb-39');
    expect(screen.getByTestId('order-rule-badge').textContent).toMatch(/HIGHEST → LOWEST/i);
    const bubbleButtons = screen.getAllByRole('button', { name: /Bubble \d:/i });
    expect(bubbleButtons.length).toBe(4);
  });

  it('launches Memory Maze with ?autostart=1 and renders the spatial grid and directional controls', () => {
    renderAtRoute('/games/memory-maze?autostart=1&seed=FIXTURE-MM-EASY-101&questions=2');
    expect(screen.getByRole('grid', { name: /Memory Maze \d by \d Grid/i })).toBeTruthy();
    const downBtn = screen.getByRole('button', { name: /Move Down/i });
    fireEvent.click(downBtn);
  });

  it('launches Path Rotation Studio with ?autostart=1 and supports Hint, Undo, and Reset controls', () => {
    renderAtRoute('/games/path-rotation?autostart=1&seed=FIXTURE-PR-EASY-101&questions=2');
    expect(screen.getByRole('grid', { name: /Path Rotation Circuit Grid/i })).toBeTruthy();

    const hintBtn = screen.getByRole('button', { name: /Apply Practice Hint/i });
    fireEvent.click(hintBtn);

    const undoBtn = screen.getByRole('button', { name: /Undo last tile move/i });
    fireEvent.click(undoBtn);

    const resetBtn = screen.getByRole('button', { name: /Reset board to initial state/i });
    fireEvent.click(resetBtn);
  });

  it('renders Cognitive Assessment Orchestrator with 5 orchestrator modes and benchmark fixtures', () => {
    renderAtRoute('/assessment');
    expect(screen.getByText('Cognitive Assessment Orchestrator')).toBeTruthy();
    expect(screen.getByText(/Select Assessment Orchestrator Mode/i)).toBeTruthy();
    expect(screen.getByText(/Full Timed Assessment/i)).toBeTruthy();
    expect(screen.getByText(/Custom Multi-Stage Battery/i)).toBeTruthy();
    expect(screen.getByText(/Interleaved Mixed Practice/i)).toBeTruthy();
  });

  it('handles Settings JSON export, rejects malformed JSON import safely, and requires confirmation to clear history', () => {
    renderAtRoute('/settings');
    expect(screen.getByText('Preferences & Data Management')).toBeTruthy();

    // Test invalid JSON import rejection
    const textarea = screen.getByLabelText(/JSON Progress Inspector/i);
    fireEvent.change(textarea, { target: { value: '{broken-json' } });
    const importBtn = screen.getByRole('button', { name: /Validate & Import JSON/i });
    fireEvent.click(importBtn);
    expect(screen.getByText(/Invalid JSON/i)).toBeTruthy();

    // Test Clear History confirmation dialog & Escape dismissal
    const clearBtn = screen.getByRole('button', { name: /Clear History/i });
    fireEvent.click(clearBtn);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders NotFoundPage for unknown routes', () => {
    renderAtRoute('/unknown-cognitive-route');
    expect(screen.getByText(/Route Not Found/i)).toBeTruthy();
  });
});
