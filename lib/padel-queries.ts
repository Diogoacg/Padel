import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createMatch,
  createPlayer,
  deleteMatch,
  deleteSeason,
  getActiveSeason,
  getMatch,
  getMatches,
  getPlayer,
  getPlayers,
  getSeasons,
  getSeasonStandings,
  updateMatch,
  type Match
} from "@/lib/padel-data";

export const queryKeys = {
  activeSeason: ["active-season"] as const,
  match: (id: string) => ["match", id] as const,
  matches: (seasonId?: string | null) => ["matches", seasonId ?? "all"] as const,
  player: (id: string) => ["player", id] as const,
  players: ["players"] as const,
  seasons: ["seasons"] as const,
  standings: (seasonId: string) => ["standings", seasonId] as const
};

const invalidatePadelData = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.players }),
    queryClient.invalidateQueries({ queryKey: ["player"] }),
    queryClient.invalidateQueries({ queryKey: ["matches"] }),
    queryClient.invalidateQueries({ queryKey: ["match"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.seasons }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activeSeason }),
    queryClient.invalidateQueries({ queryKey: ["standings"] })
  ]);

export function useActiveSeason() {
  return useQuery({
    queryFn: getActiveSeason,
    queryKey: queryKeys.activeSeason
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

export function useMatches(seasonId?: string | null, enabled = true) {
  return useQuery({
    enabled,
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
    mutationFn: (match: Omit<Match, "id" | "seasonId">) => createMatch(match),
    onSuccess: async () => {
      await invalidatePadelData(queryClient);
    }
  });
}

export function useDeleteMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMatch,
    onSuccess: async () => {
      await invalidatePadelData(queryClient);
    }
  });
}

export function useUpdateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, match }: { id: string; match: Omit<Match, "id" | "seasonId"> }) =>
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
