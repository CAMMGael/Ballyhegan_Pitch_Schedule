import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const { username, password } = credentials;

        const input = username.toLowerCase().trim();

        // Try admin login (by email)
        const admin = await prisma.admin.findUnique({
          where: { email: input },
        });

        if (admin && admin.isActive) {
          const isValid = await bcrypt.compare(password, admin.passwordHash);
          if (isValid) {
            return {
              id: admin.id,
              name: admin.name,
              role: "admin",
            };
          }
        }

        // Try team login (by slug)
        const teamBySlug = await prisma.team.findUnique({
          where: { slug: input },
        });

        if (teamBySlug && teamBySlug.isActive) {
          const isValid = await bcrypt.compare(password, teamBySlug.passwordHash);
          if (isValid) {
            return {
              id: teamBySlug.id,
              name: teamBySlug.name,
              role: "team",
              teamSlug: teamBySlug.slug,
            };
          }
        }

        // Try team login (by contact email)
        const teamByEmail = await prisma.team.findFirst({
          where: { contactEmail: input, isActive: true },
        });

        if (teamByEmail) {
          const isValid = await bcrypt.compare(password, teamByEmail.passwordHash);
          if (isValid) {
            return {
              id: teamByEmail.id,
              name: teamByEmail.name,
              role: "team",
              teamSlug: teamByEmail.slug,
            };
          }
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as Record<string, unknown>).role;
        token.teamSlug = (user as unknown as Record<string, unknown>).teamSlug;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.id;
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).teamSlug = token.teamSlug;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
};
