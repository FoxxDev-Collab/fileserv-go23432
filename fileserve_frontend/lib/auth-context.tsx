"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authAPI, setAuthToken, getAuthToken, clearAuthToken } from "./api";

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  groups?: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to get cached user from localStorage
function getCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem("user");
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Invalid JSON, ignore
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize with cached user immediately - no loading flash
  const [user, setUser] = useState<User | null>(() => getCachedUser());
  // Only show loading if we have no cached user but have a token
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    const hasToken = !!getAuthToken();
    const hasCachedUser = !!getCachedUser();
    // Only loading if we have a token but no cached user
    return hasToken && !hasCachedUser;
  });

  // Validate session in background on mount
  useEffect(() => {
    const validateAuth = async () => {
      const token = getAuthToken();
      if (!token) {
        // No token, ensure we're logged out
        setUser(null);
        setIsLoading(false);
        localStorage.removeItem("user");
        return;
      }

      try {
        // Validate token by getting current user
        const userData = await authAPI.getCurrentUser();
        const validatedUser: User = {
          id: userData.id,
          username: userData.username,
          role: userData.is_admin ? "admin" : "user",
          groups: userData.groups || [],
        };

        // Update user and cache
        setUser(validatedUser);
        localStorage.setItem("user", JSON.stringify(validatedUser));
      } catch (error) {
        console.error("Auth validation failed:", error);
        // Token is invalid, clear everything
        clearAuthToken();
        localStorage.removeItem("user");
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    validateAuth();
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

      // Also store user in localStorage for persistence
      localStorage.setItem("user", JSON.stringify(userData));
      setUser(userData);
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error("Logout error:", error);
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
