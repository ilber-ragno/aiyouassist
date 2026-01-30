import { Navigate } from 'react-router-dom';

// Dashboard now redirects to the Overview page (SaaS Portal)
export default function Dashboard() {
  return <Navigate to="/" replace />;
}
