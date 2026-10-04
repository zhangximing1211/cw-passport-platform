import type { UserDto, UserType } from "../../shared/api";
import { ApiError, apiGet, apiPatch, apiPost } from "./client";

export type RegisterInput = {
  username: string; email: string; password: string; company: string; userType: UserType; contact?: string; phone?: string;
};

export const login = (username: string, password: string) => apiPost<{ user: UserDto }>("/auth/login", { username, password });
export const register = (input: RegisterInput) => apiPost<{ user: UserDto; regulatorRequested: boolean }>("/auth/register", input);
export const logout = () => apiPost<void>("/auth/logout");
export const requestPasswordReset = (identifier: string) => apiPost<{ message: string }>("/auth/forgot", { identifier });
export const resetPassword = (token: string, password: string) => apiPost<{ message: string }>("/auth/reset", { token, password });
export const updateProfile = (input: { email?: string; contact?: string; phone?: string }) => apiPatch<{ user: UserDto }>("/auth/me", input);
export const changePassword = (currentPassword: string, newPassword: string) => apiPost<{ message: string }>("/auth/password", { currentPassword, newPassword });

/** The signed-in user, or null when there is no valid session. */
export async function getCurrentUser(): Promise<UserDto | null> {
  try {
    return (await apiGet<{ user: UserDto }>("/auth/me")).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
