import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";

interface AuthContextValue {
  user: api.User | null;
  quota: api.QuotaInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: { email: string; password: string }) => Promise<api.AuthResponse>;
  register: (data: { email: string; password: string; displayName?: string }) => Promise<api.AuthResponse>;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_KEY = ["auth", "me"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: AUTH_KEY,
    queryFn: api.getMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMut = useMutation({
    mutationFn: api.login,
    onSuccess: (res) => {
      queryClient.setQueryData(AUTH_KEY, res);
    },
  });

  const registerMut = useMutation({
    mutationFn: api.register,
    onSuccess: (res) => {
      queryClient.setQueryData(AUTH_KEY, res);
    },
  });

  const logoutMut = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.setQueryData(AUTH_KEY, null);
      queryClient.invalidateQueries();
    },
  });

  const loginFn = useCallback(
    (d: { email: string; password: string }) => loginMut.mutateAsync(d),
    [loginMut],
  );

  const registerFn = useCallback(
    (d: { email: string; password: string; displayName?: string }) => registerMut.mutateAsync(d),
    [registerMut],
  );

  const logoutFn = useCallback(async () => {
    await logoutMut.mutateAsync();
  }, [logoutMut]);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [...AUTH_KEY] });
  }, [queryClient]);

  const value: AuthContextValue = {
    user: data?.user ?? null,
    quota: data?.quota ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
    login: loginFn,
    register: registerFn,
    logout: logoutFn,
    refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
