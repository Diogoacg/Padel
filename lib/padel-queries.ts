import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from "@tanstack/react-query";
import {
  applyInactivityDecay,
  createMatch,
  createPendingMatch,
  createPlayer,
  deleteMatch,
  deleteSeason,
  getActiveSeason,
  getHomeDashboard,
  getMatch,
  getMatches,
  getPlayer,
  getPlayerRatingHistory,
  getPlayers,
  getSeasons,
  getSeasonStandings,
  updateMatch,
  type CompletedMatchInput,
  type Match
} from "@/lib/padel-data";

export const queryKeys = {
  activeSeason: ["active-season"] as const,
  decay: ["inactivity-decay"] as const,
  homeDashboard: (seasonId?: string | null) => ["home-dashboard", seasonId ?? "active"] as const,
  match: (id: string) => ["match", id] as const,
  matches: (seasonId?: string | null) => ["matches", seasonId ?? "all"] as const,
  player: (id: string) => ["player", id] as const,
  playerRatingHistory: (id: string, seasonId?: string | null) =>
    ["player-rating-history", id, seasonId ?? "active"] as const,
  players: ["players"] as const,
  seasons: ["seasons"] as const,
  standings: (seasonId: string) => ["standings", seasonId] as const
};

const invalidatePadelData = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.players }),
    queryClient.invalidateQueries({ queryKey: ["home-dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["player"] }),
    queryClient.invalidateQueries({ queryKey: ["player-rating-history"] }),
    queryClient.invalidateQueries({ queryKey: ["matches"] }),
    queryClient.invalidateQueries({ queryKey: ["match"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.seasons }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activeSeason }),
    queryClient.invalidateQueries({ queryKey: ["standings"] })
  ]);

const invalidateActiveData = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.players }),
    queryClient.invalidateQueries({ queryKey: ["home-dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["player"] }),
    queryClient.invalidateQueries({ queryKey: ["player-rating-history"] }),
    queryClient.invalidateQueries({ queryKey: ["matches"] }),
    queryClient.invalidateQueries({ queryKey: ["match"] }),
    queryClient.invalidateQueries({ queryKey: ["standings"] })
  ]);

export function useInactivityDecay() {
  const queryClient = useQueryClient();

  return useQuery({
    queryFn: async () => {
      const changedPlayers = await applyInactivityDecay();
      if (changedPlayers > 0) {
        await invalidateActiveData(queryClient);
      }
      return changedPlayers;
    },
    queryKey: queryKeys.decay,
    refetchOnMount: false,
    staleTime: 1000 * 60 * 60 * 6
  });
}

export function useActiveSeason() {
  return useQuery({
    queryFn: getActiveSeason,
    queryKey: queryKeys.activeSeason
  });
}

export function useHomeDashboard(seasonId?: string | null) {
  return useQuery({
    queryFn: () => getHomeDashboard(seasonId),
    queryKey: queryKeys.homeDashboard(seasonId)
  });
}

export function usePlayers() {
  return useQuery({
    queryFn: getPlayers,
    queryKey: queryKeys.players
  });
}

export function usePlayer(id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getPlayer(id),
    queryKey: queryKeys.player(id)
  });
}

export function usePlayerRatingHistory(id: string, seasonId?: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(id),
    placeholderData: keepPreviousData,
    queryFn: () => getPlayerRatingHistory(id, seasonId),
    queryKey: queryKeys.playerRatingHistory(id, seasonId)
  });
}

export function useMatches(seasonId?: string | null, enabled = true) {
  return useQuery({
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => getMatches(seasonId),
    queryKey: queryKeys.matches(seasonId)
  });
}

export function useMatch(id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getMatch(id),
    queryKey: queryKeys.match(id)
  });
}

export function useSeasons() {
  return useQuery({
    queryFn: getSeasons,
    queryKey: queryKeys.seasons
  });
}

export function useSeasonStandings(seasonId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(seasonId),
    placeholderData: keepPreviousData,
    queryFn: () => getSeasonStandings(seasonId),
    queryKey: queryKeys.standings(seasonId)
  });
}

export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPlayer,
    onSuccess: async () => {
      await invalidatePadelData(queryClient);
    }
  });
}

export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (match: CompletedMatchInput) => createMatch(match),
    onSuccess: async () => {
      await invalidatePadelData(queryClient);
    }
  });
}

export function useCreatePendingMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPendingMatch,
    onSuccess: async () => {
      await invalidatePadelData(queryClient);
    }
  });
}

export function useDeleteMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMatch,
    onMutate: async (matchId) => {
      await queryClient.cancelQueries({ queryKey: ["matches"] });
      const matchQueries = queryClient.getQueriesData<Match[]>({ queryKey: ["matches"] });

      for (const [queryKey, matches] of matchQueries) {
        if (matches) {
          queryClient.setQueryData(
            queryKey,
            matches.filter((match) => match.id !== matchId)
          );
        }
      }

      return { matchQueries };
    },
    onError: (_error, _matchId, context) => {
      context?.matchQueries.forEach(([queryKey, matches]) => {
        queryClient.setQueryData(queryKey, matches);
      });
    },
    onSuccess: async () => {
      await invalidatePadelData(queryClient);
    }
  });
}

export function useUpdateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, match }: { id: string; match: CompletedMatchInput }) =>
      updateMatch(id, match),
    onSuccess: async () => {
      await invalidatePadelData(queryClient);
    }
  });
}

export function useDeleteSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSeason,
    onSuccess: async () => {
      await invalidatePadelData(queryClient);
    }
  });
}

export function usePrefetchPlayer() {
  const queryClient = useQueryClient();

  return (id: string) =>
    queryClient.prefetchQuery({
      queryFn: () => getPlayer(id),
      queryKey: queryKeys.player(id),
      staleTime: 45_000
    });
}

export function usePrefetchMatch() {
  const queryClient = useQueryClient();

  return (id: string) =>
    queryClient.prefetchQuery({
      queryFn: () => getMatch(id),
      queryKey: queryKeys.match(id),
      staleTime: 45_000
    });
}
