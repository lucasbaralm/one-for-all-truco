"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Heart, Spade } from "lucide-react";

export default function GateForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || "Senha incorreta.");
        setLoading(false);
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setErrorMsg("Ocorreu um erro na conexão.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-black">
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <motion.div animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="absolute top-1/4 left-1/4 text-red-500">
          <Heart size={120} />
        </motion.div>
        <motion.div animate={{ y: [0, 30, 0], rotate: [0, -15, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute bottom-1/4 right-1/4 text-zinc-400">
          <Spade size={100} />
        </motion.div>
      </div>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="z-10 w-full max-w-sm"
      >
        <Card className="bg-zinc-900 border-zinc-800 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center mb-2">
              <div className="bg-red-500/10 p-3 rounded-2xl border border-red-500/20">
                <Lock className="w-8 h-8 text-red-500" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-white">
              Acesso Restrito
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Digite a senha para entrar na Fodinha
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gate-password" className="text-zinc-300">Senha</Label>
                <Input
                  id="gate-password"
                  type="password"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  className="bg-black/50 border-zinc-800 text-white placeholder:text-zinc-600 h-12 text-lg"
                />
              </div>

              {errorMsg && (
                <div className="text-red-500 text-sm font-bold bg-red-900/20 p-3 rounded-md border border-red-900/50">
                  {errorMsg}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-lg font-bold bg-white text-black hover:bg-zinc-200 transition-colors"
                disabled={!password.trim() || loading}
              >
                {loading ? "Verificando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
