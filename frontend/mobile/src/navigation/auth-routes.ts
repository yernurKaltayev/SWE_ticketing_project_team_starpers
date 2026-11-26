export const authScreens = {
  Login: "login",
  Register: "register",
  VerifyEmail: "verify-email",
  ForgotPassword: "forgot-password",
  ResetPassword: "reset-password",
} as const;

export type AuthScreenName = keyof typeof authScreens;
export type AuthParams = { returnTo?: string; token?: string; email?: string };
export const authScreenNames = Object.keys(authScreens) as AuthScreenName[];
