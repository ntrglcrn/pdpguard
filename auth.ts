import NextAuth from "next-auth";
import Auth0 from "next-auth/providers/auth0";

import { authProviderConfigured } from "@/lib/external-auth";

export { authProviderConfigured };

export const { handlers, auth, signOut } = NextAuth({
  providers: authProviderConfigured()
    ? [
        Auth0({
          clientId: process.env.AUTH0_CLIENT_ID,
          clientSecret: process.env.AUTH0_CLIENT_SECRET,
          issuer: process.env.AUTH0_ISSUER,
        }),
      ]
    : [],
  callbacks: {
    jwt({ token, profile }) {
      if (profile?.sub) token.sub = `auth0:${profile.sub}`;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
