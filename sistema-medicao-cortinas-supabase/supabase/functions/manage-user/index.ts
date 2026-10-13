// Edge Function: manage-user
// ------------------------------------------------------------
// Roda no servidor do Supabase (Deno), não no navegador. É a única parte
// do sistema com permissão de administrador (Service Role) — cria contas
// de login de verdade no Supabase Auth e redefine senha de outra pessoa,
// coisas que o app no navegador nunca deve conseguir fazer sozinho.
//
// Publicar: supabase functions deploy manage-user   (veja o README)
// ------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const PAPEIS_VALIDOS = ["Gestor Master", "Gestor", "Vendedor", "Fábrica", "Instalador"];

// CORS: o navegador manda um "preflight" (método OPTIONS) antes de QUALQUER
// chamada feita de outro domínio (ex.: seu site na Hostinger) para uma Edge
// Function. Sem responder isso corretamente — inclusive nas respostas de
// verdade, não só no preflight — o navegador bloqueia a chamada antes dela
// chegar aqui, e o erro que aparece no app é genérico ("Failed to send a
// request to the Edge Function"), sem detalhe nenhum do que aconteceu.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function loginParaEmail(login: string) {
  return (
    login
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "") + "@miriamrios.com"
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  // Resposta ao preflight — precisa vir ANTES de qualquer outra lógica.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return jsonResponse({ erro: "Não autenticado." }, 401);

    // Cliente "como o chamador", só para descobrir quem está pedindo isso.
    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await asCaller.auth.getUser(token);
    if (userErr || !userData.user) return jsonResponse({ erro: "Sessão inválida." }, 401);

    // Cliente com privilégio de administrador — nunca é exposto ao navegador.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerPerfil } = await admin
      .from("perfis")
      .select("*")
      .eq("id", userData.user.id)
      .single();

    const podeGerenciar = callerPerfil && ["Gestor Master", "Gestor"].includes(callerPerfil.papel);
    if (!podeGerenciar) return jsonResponse({ erro: "Sem permissão para gerenciar usuários." }, 403);

    const body = await req.json();

    if (body.acao === "criar") {
      const { nome, login, senha, papel } = body;
      if (!nome?.trim() || !login?.trim() || !senha || senha.length < 4) {
        return jsonResponse({ erro: "Preencha nome, login e uma senha com pelo menos 4 caracteres." }, 400);
      }
      if (!PAPEIS_VALIDOS.includes(papel)) {
        return jsonResponse({ erro: "Perfil inválido." }, 400);
      }
      // Só o Gestor Master pode criar outro Gestor Master.
      if (papel === "Gestor Master" && callerPerfil.papel !== "Gestor Master") {
        return jsonResponse({ erro: "Só o Gestor Master pode criar outro Gestor Master." }, 403);
      }

      const email = loginParaEmail(login);
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });
      if (createErr) return jsonResponse({ erro: createErr.message }, 400);

      const { data: perfil, error: perfilErr } = await admin
        .from("perfis")
        .insert({
          id: created.user.id,
          nome: nome.trim(),
          login: login.trim(),
          papel,
          ativo: true,
          criado_por: body.criadoPor || callerPerfil.nome,
        })
        .select()
        .single();

      if (perfilErr) {
        // Se o perfil falhar, desfaz a criação da conta para não deixar lixo.
        await admin.auth.admin.deleteUser(created.user.id);
        return jsonResponse({ erro: perfilErr.message }, 400);
      }

      return jsonResponse({ usuario: perfil });
    }

    if (body.acao === "editar") {
      const { id, nome, login, papel, ativo, novaSenha } = body;
      if (!id) return jsonResponse({ erro: "Usuário não informado." }, 400);

      const { data: alvo } = await admin.from("perfis").select("*").eq("id", id).single();
      if (!alvo) return jsonResponse({ erro: "Usuário não encontrado." }, 404);

      // Gestor comum não edita um Gestor Master, e não muda o perfil de ninguém.
      const isMaster = callerPerfil.papel === "Gestor Master";
      if (alvo.papel === "Gestor Master" && !isMaster) {
        return jsonResponse({ erro: "Só o Gestor Master edita outro Gestor Master." }, 403);
      }
      if (papel && papel !== alvo.papel && !isMaster) {
        return jsonResponse({ erro: "Só o Gestor Master altera o perfil de um usuário." }, 403);
      }

      if (novaSenha) {
        if (novaSenha.length < 4) return jsonResponse({ erro: "Senha muito curta." }, 400);
        const { error: senhaErr } = await admin.auth.admin.updateUserById(id, { password: novaSenha });
        if (senhaErr) return jsonResponse({ erro: senhaErr.message }, 400);
      }

      if (login && login.trim() !== alvo.login) {
        const { error: emailErr } = await admin.auth.admin.updateUserById(id, {
          email: loginParaEmail(login),
        });
        if (emailErr) return jsonResponse({ erro: emailErr.message }, 400);
      }

      const patch: Record<string, unknown> = {};
      if (nome !== undefined) patch.nome = nome.trim();
      if (login !== undefined) patch.login = login.trim();
      if (ativo !== undefined) patch.ativo = ativo;
      if (papel !== undefined && isMaster) patch.papel = papel;

      const { data: atualizado, error: updErr } = await admin
        .from("perfis")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (updErr) return jsonResponse({ erro: updErr.message }, 400);

      return jsonResponse({ usuario: atualizado });
    }

    return jsonResponse({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    return jsonResponse({ erro: String(e) }, 500);
  }
});
