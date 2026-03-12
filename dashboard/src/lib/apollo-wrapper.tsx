"use client";

import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client/core";
import { setContext } from "@apollo/client/link/context";
import { ApolloProvider } from "@apollo/client/react";
import { supabase } from "./supabase";

const httpLink = new HttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:4000/graphql",
});

const authLink = setContext(async (_, { headers }) => {
  if (!supabase) return { headers };

  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    // No session — let proxy handle the redirect
    return { headers };
  }

  return {
    headers: {
      ...headers,
      authorization: `Bearer ${session.access_token}`,
      "x-page-route":
        typeof window !== "undefined" ? window.location.pathname : "ssr",
    },
  };
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
