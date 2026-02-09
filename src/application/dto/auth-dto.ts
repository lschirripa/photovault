export interface SignUpRequestDTO {
  email: string;
  password: string;
  displayName: string;
}

export interface SignInRequestDTO {
  email: string;
  password: string;
}

export interface MagicLinkRequestDTO {
  email: string;
}

export interface AuthResponseDTO {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
  session: {
    accessToken: string;
    expiresAt: string;
  };
}

export interface OAuthRequestDTO {
  provider: "google" | "apple" | "github";
  redirectUrl?: string;
}

export interface OAuthResponseDTO {
  url: string;
}
