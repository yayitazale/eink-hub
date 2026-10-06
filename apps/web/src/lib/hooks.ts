import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Collection, type Frame, type Settings } from './api';
import { useToast } from '../components/ui';

export const useFrames = () => useQuery({ queryKey: ['frames'], queryFn: () => api.get<Frame[]>('/api/frames'), refetchInterval: 30_000 });
export const useFrame = (id: number) =>
  useQuery({ queryKey: ['frames', id], queryFn: () => api.get<Frame>(`/api/frames/${id}`), refetchInterval: 30_000 });
export const useCollections = () => useQuery({ queryKey: ['collections'], queryFn: () => api.get<Collection[]>('/api/collections') });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/api/settings') });
export const useImmichStatus = () =>
  useQuery({
    queryKey: ['immich', 'status'],
    queryFn: () => api.get<{ configured: boolean; ok?: boolean; error?: string; user?: { name: string; email: string } }>('/api/immich/status'),
    staleTime: 60_000,
  });

/** Mutation with toast feedback and cache invalidation. */
export function useAction<TArgs, TResult = unknown>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: unknown[][] } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.success) toast(typeof opts.success === 'function' ? opts.success(r) : opts.success, 'ok');
      for (const key of opts.invalidate ?? [['frames']]) qc.invalidateQueries({ queryKey: key });
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });
}
