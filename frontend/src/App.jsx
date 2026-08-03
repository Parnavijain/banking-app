import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './context/ToastContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';

function RequireAuth({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            {/* Socket + Toast only exist inside the authenticated area. */}
            <SocketProvider>
              <ToastProvider>
                <Dashboard />
              </ToastProvider>
            </SocketProvider>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
