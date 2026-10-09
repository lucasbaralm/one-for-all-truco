"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// Foto + boas-vindas, compartilhado pelo menu de jogos e pelos lobbies de cada
// jogo. A foto fica "salva na conta": vai pro bucket "avatars" do Supabase
// Storage (precisa existir e ter as policies certas) sob o path do próprio
// usuário, e a URL pública vai pro user_metadata.
export function ProfileHeader({ compact = false }: { compact?: boolean }) {
  const { user } = useAuthUser(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copia a foto do usuário carregado pro estado editável
    if (user) setAvatarUrl(user.avatarUrl);
  }, [user]);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (!file || !user) return;

    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Imagem muito grande (máximo 5MB).");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) {
        setError("Não foi possível enviar a foto. Tente novamente.");
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust: o path não muda num re-upload (upsert), então sem isso o
      // navegador (e outros jogadores) continuariam vendo a imagem antiga em cache.
      const publicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      if (updateError) {
        setError("Foto enviada, mas não deu pra salvar no perfil. Tente de novo.");
        return;
      }
      setAvatarUrl(publicUrl);
    } catch {
      setError("Ocorreu um erro ao enviar a foto.");
    } finally {
      setUploading(false);
    }
  };

  const name = user?.name ?? "Jogador";
  return (
    <div className={`flex items-center ${compact ? "flex-row gap-3" : "flex-col gap-2"}`}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !user}
        className="relative group rounded-full disabled:cursor-wait"
        title="Trocar foto de perfil"
      >
        <PlayerAvatar avatarUrl={avatarUrl} name={name} className={compact ? "w-12 h-12 text-lg" : "w-20 h-20 text-2xl"} />
        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
        </div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />
      {error && <p className="text-red-500 text-xs font-bold max-w-xs">{error}</p>}
      <p className="text-zinc-400">
        Bem-vindo(a), <span className="text-red-500 font-bold">{name}</span>!
      </p>
    </div>
  );
}
