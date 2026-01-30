import { Navigate } from 'react-router-dom';

// Settings redirects to the new SettingsPage route
export default function Settings() {
  return <Navigate to="/settings" replace />;
}
