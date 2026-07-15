import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { FilePage } from './pages/FilePage.tsx'

// Catch-all `*` path encodes the file path verbatim (matches the
// shape of GET /api/files). `/<file-path>` → FilePage for the file.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/functions.ts" replace />} />
        <Route path="/*" element={<FilePage />} />
      </Routes>
    </BrowserRouter>
  )
}
