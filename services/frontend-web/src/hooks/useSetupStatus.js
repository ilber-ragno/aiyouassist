import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export default function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api.get('/setup-status').then(r => r.data),
    staleTime: 30000,
  });
}
