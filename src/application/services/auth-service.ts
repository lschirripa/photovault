import { User } from "@/domain/entities/user";

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface OAuthProvider {
  provider: "google" | "apple" | "github";
  redirectUrl: string;
}

export interface IAuthService {
  getCurrentUser(): Promise<User | null>;
  getSession(): Promise<AuthSession | null>;
  signUp(input: SignUpInput): Promise<AuthSession>;
  signInWithPassword(input: SignInInput): Promise<AuthSession>;
  signInWithOAuth(provider: OAuthProvider): Promise<{ url: string }>;
  signInWithMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  refreshSession(): Promise<AuthSession | null>;
}
