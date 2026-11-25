/**
 * Điểm khởi chạy ứng dụng React TripSplit trên trình duyệt.
 * Nạp CSS toàn cục và gắn component gốc vào phần tử `#root`.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
