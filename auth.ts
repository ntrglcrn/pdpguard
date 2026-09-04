import NextAuth from "next-auth";
import Auth0 from "next-auth/providers/auth0";

const configured = Boolean(
  process.env.AUTH0_CLIENT_ID &&
  process.env.AUTH0_CLIENT_SECRET &&
  process.env.AUTH0_ISSUER &&
  process.env.AUTH_SECRET &&
  process.env.AUTH_URL,
);

export const authProviderConfigured = () => configured;

export const { handlers, auth, signOut } = NextAuth({
  providers: configured
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
