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

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCheckedAuth: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
      console.log("[Auth] Token found:", !!token);

      if (!token) {
        // No token = not authenticated
        console.log("[Auth] No token, user is not authenticated");
        setUser(null);
        setIsLoading(false);
        setHasCheckedAuth(true);
        return;
      }

      // Have token - validate with server
      try {
        console.log("[Auth] Validating token with server...");
        const userData = await authAPI.getCurrentUser();
        console.log("[Auth] Token valid, user:", userData.username);

        const validatedUser: User = {
          id: userData.id,
          username: userData.username,
          role: userData.is_admin ? "admin" : "user",
          groups: userData.groups || [],
        };

        setUser(validatedUser);
        localStorage.setItem("user", JSON.stringify(validatedUser));
      } catch (error: unknown) {
        console.error("[Auth] Validation failed:", error);
        // Only clear on 401/403, keep user on network errors
        if (error instanceof APIError && (error.status === 401 || error.status === 403)) {
          console.log("[Auth] Token invalid (401/403), clearing auth");
          clearAuthToken();
          localStorage.removeItem("user");
          setUser(null);
        } else {
          // Network error - try to use cached user
          console.log("[Auth] Network error, trying cached user");
          try {
            const cached = localStorage.getItem("user");
            if (cached) {
              setUser(JSON.parse(cached));
            }
          } catch {
            // Ignore parse errors
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
      console.log("[Auth] Logging in...");
      const response = await authAPI.login(username, password);

      // Store the token
      setAuthToken(response.token);
      console.log("[Auth] Token stored");

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
      setHasCheckedAuth(true);
      console.log("[Auth] Login successful, user:", userData.username);
    } catch (error) {
      console.error("[Auth] Login failed:", error);
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
