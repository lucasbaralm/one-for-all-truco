"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spade, Heart, Club, Diamond } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    // Tenta redirecionar se já estiver logado
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push("/lobby");
      }
    };
    checkSession();
  }, [router, supabase]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) return;
    
    setLoading(true);
    setErrorMsg("");
    
    // Email fantasma para burlar a exigência do Supabase
    const fakeEmail = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@fodinha.local`;
    
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password: password
        });
        
        if (error) {
          setErrorMsg("Credenciais inválidas. Tem certeza que a senha está certa?");
          setLoading(false);
          return;
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: fakeEmail,
          password: password,
          options: {
            data: { username: name.trim() } // Salva o nome real (com maiúsculas) no metadata
          }
        });
        
        if (error) {
          setErrorMsg(`Erro: ${error.message}`);
          setLoading(false);
          return;
        }

        if (data.user && !data.session) {
          setErrorMsg("Sua conta Supabase exige confirmação de E-mail. Desative isso no Painel do Supabase > Auth > Providers > Email.");
          setLoading(false);
          return;
        }
      }

      router.push("/lobby");
    } catch (err) {
      setErrorMsg("Ocorreu um erro na conexão.");
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">

      {/* Elementos visuais de fundo */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <motion.div animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="absolute top-1/4 left-1/4 text-red-500">
          <Heart size={120} />
        </motion.div>
        <motion.div animate={{ y: [0, 30, 0], rotate: [0, -15, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute bottom-1/4 right-1/4 text-zinc-400">
          <Spade size={100} />
        </motion.div>
        <motion.div animate={{ y: [0, -15, 0], rotate: [0, 20, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }} className="absolute top-1/3 right-1/3 text-red-500">
          <Diamond size={80} />
        </motion.div>
        <motion.div animate={{ y: [0, 25, 0], rotate: [0, -10, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 3 }} className="absolute bottom-1/3 left-1/3 text-zinc-400">
          <Club size={90} />
        </motion.div>
      </div>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="z-10 w-full max-w-md"
      >
        <Card className="bg-zinc-900 border-zinc-800 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center space-y-2">
            <motion.div className="flex justify-center mb-4 space-x-2">
              <div className="bg-red-500/10 p-3 rounded-2xl border border-red-500/20">
                <Heart className="w-8 h-8 text-red-500" />
              </div>
              <div className="bg-zinc-100/10 p-3 rounded-2xl border border-zinc-100/20">
                <Spade className="w-8 h-8 text-zinc-100" />
              </div>
            </motion.div>
            <CardTitle className="text-4xl font-black tracking-tight text-white">
              FODINHA
            </CardTitle>
            <CardDescription className="text-zinc-400 text-lg">
              Faça login ou crie sua conta para jogar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-zinc-300">Usuário</Label>
                <Input 
                  id="name" 
                  placeholder="Seu nome no jogo" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-black/50 border-zinc-800 text-white placeholder:text-zinc-600 h-12 text-lg"
                  autoComplete="off"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">Senha</Label>
                <Input 
                  id="password" 
                  type="password"
                  placeholder="********" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                className="w-full h-12 text-lg font-bold bg-white text-black hover:bg-zinc-200 transition-colors mt-4"
                disabled={!name.trim() || !password.trim() || loading}
              >
                {loading ? "Aguarde..." : (isLogin ? "Entrar na Mesa" : "Criar Conta e Jogar")}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center flex-col gap-2">
            <Button 
              variant="link" 
              onClick={() => setIsLogin(!isLogin)} 
              className="text-zinc-400 hover:text-white"
            >
              {isLogin ? "Ainda não tem conta? Clique aqui" : "Já tem conta? Faça Login"}
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
