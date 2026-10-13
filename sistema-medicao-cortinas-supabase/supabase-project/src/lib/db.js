import { supabase } from "./supabaseClient";

/* ============================================================
   Camada de dados — substitui o antigo window.storage por chamadas
   reais ao Supabase (Postgres + Auth). Os nomes das funções e o
   formato dos objetos (pedido, evento, usuário) foram mantidos
   iguais aos do app original para que os componentes React não
   precisassem ser reescritos — só esta camada mudou de lugar.
   ============================================================ */

// Domínio interno usado só para transformar o "nome de usuário" que a
// pessoa digita em algo no formato de e-mail, que é o que o Supabase Auth
// exige. Não precisa ser um endereço real — ninguém recebe e-mail nele.
const LOGIN_DOMAIN = "@login.suamedicao.app";
function loginParaEmail(login) {
  return (
    login
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/\s+/g, ".") + LOGIN_DOMAIN
  );
}

/* ------------------------------------------------------------
   PEDIDOS
   ------------------------------------------------------------ */
function pedidoParaLinha(pedido) {
  return {
    id: pedido.id,
    numero: pedido.numero,
    cliente: pedido.cliente,
    telefone: pedido.telefone,
    endereco: pedido.endereco,
    vendedor: pedido.vendedor,
    criado_em: pedido.criadoEm,
    status: pedido.status,
    ambientes: pedido.ambientes,
  };
}
function linhaParaPedido(row) {
  return {
    id: row.id,
    numero: row.numero,
    cliente: row.cliente,
    telefone: row.telefone,
    endereco: row.endereco,
    vendedor: row.vendedor,
    criadoEm: row.criado_em,
    status: row.status,
    ambientes: row.ambientes || [],
  };
}

export async function loadIndex() {
  const { data, error } = await supabase
    .from("pedidos")
    .select("id,numero,cliente,criado_em,status")
    .order("numero", { ascending: false });
  if (error) {
    console.error("loadIndex:", error.message);
    return [];
  }
  return data.map((r) => ({ id: r.id, numero: r.numero, cliente: r.cliente, criadoEm: r.criado_em, status: r.status }));
}

// A tabela `pedidos` já é a fonte de verdade e loadIndex() sempre lê direto
// dela — não existe mais um "índice" separado para manter sincronizado.
// Mantido como no-op para não exigir mudar quem já chamava saveIndex(...).
export async function saveIndex() {
  return true;
}

export async function loadPedido(id) {
  const { data, error } = await supabase.from("pedidos").select("*").eq("id", id).single();
  if (error) {
    console.error("loadPedido:", error.message);
    return null;
  }
  return linhaParaPedido(data);
}

export async function savePedido(pedido) {
  const { error } = await supabase.from("pedidos").upsert(pedidoParaLinha(pedido));
  if (error) {
    console.error("savePedido:", error.message);
    return false;
  }
  return true;
}

// Numeração sequencial de verdade: função Postgres com uma sequence
// (supabase/schema.sql). Atômica — sem a janela de corrida que existia
// quando o contador vivia num arquivo JSON no armazenamento local.
export async function nextNumero() {
  const { data, error } = await supabase.rpc("next_pedido_numero");
  if (error) {
    console.error("nextNumero:", error.message);
    throw error;
  }
  return data;
}

/* ------------------------------------------------------------
   USUÁRIOS / AUTENTICAÇÃO
   ------------------------------------------------------------
   Login e senha agora são o Supabase Auth de verdade (hash forte no
   servidor, sessão por JWT). O "nome de usuário" digitado vira um e-mail
   interno (loginParaEmail) só para caber no formato que o Auth exige — a
   pessoa continua só digitando nome de usuário e senha, sem perceber isso.
   ------------------------------------------------------------ */
export async function getSessaoAtual() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function carregarPerfil(userId) {
  const { data, error } = await supabase.from("perfis").select("*").eq("id", userId).single();
  if (error) return null;
  return { id: data.id, nome: data.nome, login: data.login, papel: data.papel, ativo: data.ativo };
}

export async function fazerLogin(loginInput, senha) {
  const email = loginParaEmail(loginInput);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) return null;
  const perfil = await carregarPerfil(data.user.id);
  if (!perfil || perfil.ativo === false) {
    await supabase.auth.signOut();
    return null;
  }
  return perfil;
}

export async function fazerLogout() {
  await supabase.auth.signOut();
}

export async function loadUsuarios() {
  const { data, error } = await supabase.from("perfis").select("*").order("nome");
  if (error) {
    console.error("loadUsuarios:", error.message);
    return [];
  }
  return data.map((u) => ({ id: u.id, nome: u.nome, login: u.login, papel: u.papel, ativo: u.ativo }));
}

// Criar usuário e redefinir senha de outra pessoa exigem privilégio de
// administrador (chave Service Role), que NUNCA deve rodar no navegador —
// por isso passam pela Edge Function `manage-user`, que roda no servidor
// do Supabase e confere a permissão de quem está chamando antes de agir.
export async function criarUsuario({ nome, login, senha, papel, criadoPor }) {
  const { data, error } = await supabase.functions.invoke("manage-user", {
    body: { acao: "criar", nome, login, senha, papel, criadoPor },
  });
  if (error) throw error;
  if (data?.erro) throw new Error(data.erro);
  return data.usuario;
}

export async function editarUsuario({ id, nome, login, papel, ativo, novaSenha }) {
  const { data, error } = await supabase.functions.invoke("manage-user", {
    body: { acao: "editar", id, nome, login, papel, ativo, novaSenha },
  });
  if (error) throw error;
  if (data?.erro) throw new Error(data.erro);
  return data.usuario;
}

/* ------------------------------------------------------------
   AGENDA (medições e instalações agendadas)
   ------------------------------------------------------------ */
function eventoParaLinha(evento) {
  return {
    id: evento.id,
    pedido_id: evento.pedidoId,
    pedido_numero: evento.pedidoNumero,
    cliente: evento.cliente,
    tipo: evento.tipo,
    data: evento.data,
    hora: evento.hora,
    observacao: evento.observacao,
    criado_por: evento.criadoPor,
    criado_em: evento.criadoEm,
  };
}
function linhaParaEvento(row) {
  return {
    id: row.id,
    pedidoId: row.pedido_id,
    pedidoNumero: row.pedido_numero,
    cliente: row.cliente,
    tipo: row.tipo,
    data: row.data,
    hora: row.hora,
    observacao: row.observacao,
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
  };
}

export async function loadEventos() {
  const { data, error } = await supabase.from("eventos").select("*").order("data");
  if (error) {
    console.error("loadEventos:", error.message);
    return [];
  }
  return data.map(linhaParaEvento);
}

export async function inserirEvento(evento) {
  const { error } = await supabase.from("eventos").insert(eventoParaLinha(evento));
  if (error) console.error("inserirEvento:", error.message);
  return !error;
}

export async function removerEvento(id) {
  const { error } = await supabase.from("eventos").delete().eq("id", id);
  if (error) console.error("removerEvento:", error.message);
  return !error;
}
