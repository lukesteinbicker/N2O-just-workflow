"use client";

import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client/core";

const ME_QUERY = gql`
  query Me {
    me {
      name
      email
      accessRole
    }
  }
`;

export interface CurrentUser {
  name: string;
  email: string;
  accessRole: "admin" | "engineer";
}

export function useCurrentUser() {
  const { data, loading } = useQuery<any>(ME_QUERY);

  const user: CurrentUser | null = data?.me ?? null;
  const isAdmin = user?.accessRole === "admin";

  return { user, isAdmin, loading };
}
