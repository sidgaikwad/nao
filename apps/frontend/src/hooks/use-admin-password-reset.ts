import { useQuery } from '@tanstack/react-query';

import { trpc } from '@/main';

export function useIsAdminPasswordResetEnabled(): boolean {
	const config = useQuery(trpc.system.getPublicConfig.queryOptions());
	return config.data?.naoMode !== 'cloud' && config.data?.enableUserLogin !== false;
}
