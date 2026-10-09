"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./client";

export interface AuthUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Usuário logado (nome e foto vêm do user_metadata, como no resto do app).
 * Com `required`, quem não tem sessão é mandado de volta pro login; sem ele
 * (ex.: partida local contra bots) o hook só devolve `user = null`.
 */
export function useAuthUser(required = true) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const session = data.session;
      if (!session) {
        if (required) router.push("/");
        setUser(null);
      } else {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata.username || "Jogador",
          avatarUrl: session.user.user_metadata.avatar_url ?? null,
        });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [required, router]);

  return { user, loading };
}
