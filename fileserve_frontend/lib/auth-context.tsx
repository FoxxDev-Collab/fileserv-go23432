"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authAPI, setAuthToken, getAuthToken, clearAuthToken, APIError } from "./api";

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  groups?: string[];
}

interface CachedUser {
  user: User;
  cachedAt: number;
}

// Cache expiry time in milliseconds (5 minutes)
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCheckedAuth: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getCachedUser(): User | null {
  try {
    const cached = localStorage.getItem("user");
    if (!cached) return null;

    const parsed: CachedUser = JSON.parse(cached);

    // Check if cache has expired
    if (Date.now() - parsed.cachedAt > CACHE_EXPIRY_MS) {
      localStorage.removeItem("user");
      return null;
    }

    return parsed.user;
  } catch {
    localStorage.removeItem("user");
    return null;
  }
}

function setCachedUser(user: User): void {
  const cached: CachedUser = {
    user,
    cachedAt: Date.now(),
  };
  localStorage.setItem("user", JSON.stringify(cached));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // All state starts as "loading" to prevent hydration mismatch
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  // Single effect: check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      // Check for token in localStorage
      const token = getAuthToken();

      if (!token) {
        // No token = not authenticated
        setUser(null);
        setIsLoading(false);
        setHasCheckedAuth(true);
        return;
      }

      // Have token - validate with server
      try {
        const userData = await authAPI.getCurrentUser();

        const validatedUser: User = {
          id: userData.id,
          username: userData.username,
          role: userData.is_admin ? "admin" : "user",
          groups: userData.groups || [],
        };

        setUser(validatedUser);
        setCachedUser(validatedUser);
      } catch (error: unknown) {
        // Only clear on 401/403, keep user on network errors
        if (error instanceof APIError && (error.status === 401 || error.status === 403)) {
          clearAuthToken();
          localStorage.removeItem("user");
          setUser(null);
        } else {
          // Network error - try to use cached user (with expiry check)
          const cachedUser = getCachedUser();
          if (cachedUser) {
            setUser(cachedUser);
          }
        }
      } finally {
        setIsLoading(false);
        setHasCheckedAuth(true);
      }
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await authAPI.login(username, password);

      // Store the token
      setAuthToken(response.token);

      // Set user data (convert is_admin to role)
      const userData: User = {
        id: response.user.id,
        username: response.user.username,
        email: response.user.email,
        role: response.user.is_admin ? "admin" : "user",
        groups: response.user.groups || [],
      };

      // Also store user in localStorage for persistence (with timestamp)
      setCachedUser(userData);
      setUser(userData);
      setHasCheckedAuth(true);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      // Silently handle logout errors
    } finally {
      clearAuthToken();
      localStorage.removeItem("user");
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        hasCheckedAuth,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
