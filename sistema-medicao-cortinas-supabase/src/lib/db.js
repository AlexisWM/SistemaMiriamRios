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
const LOGIN_DOMAIN = "@miriamrios.com";
function loginParaEmail(login) {
  return (
    login
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/\s+/g, "") + LOGIN_DOMAIN
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
    cpf: pedido.cpf || null,
    telefone: pedido.telefone,
    endereco: pedido.endereco,
    vendedor: pedido.vendedor,
    criado_em: pedido.criadoEm,
    status: pedido.status,
    perdido_em: pedido.perdidoEm || null,
    ambientes: pedido.ambientes,
    // Versões de orçamento (supabase/orcamentos.sql). Só vai na gravação se a
    // coluna existir (ou se já há versões guardadas), pra nunca quebrar o
    // salvamento de quem ainda não rodou o SQL.
    ...(pedido.orcamentos ? { orcamentos: pedido.orcamentos } : {}),
  };
}
function linhaParaPedido(row) {
  return {
    id: row.id,
    numero: row.numero,
    cliente: row.cliente,
    cpf: row.cpf || "",
    telefone: row.telefone,
    endereco: row.endereco,
    vendedor: row.vendedor,
    criadoEm: row.criado_em,
    status: row.status,
    perdidoEm: row.perdido_em || null,
    ambientes: row.ambientes || [],
    orcamentos: row.orcamentos || null,
    // true quando o banco ainda não tem a coluna `orcamentos` (SQL não rodado).
    orcamentosAusente: row.orcamentos === undefined,
  };
}

// Sinalizadores leves derivados de `ambientes` (peças) pra alimentar a
// lista/Funil/Painel sem cada tela ter que reabrir o pedido inteiro —
// mesma lógica de indexFlagsFor() no App.jsx, só que rodando aqui porque
// é loadIndex() que decide quais colunas buscar do Supabase.
function flagsDeAmbientes(ambientes = []) {
  const pecas = (ambientes || []).flatMap((a) => a.pecas || []);
  return {
    disponivel: pecas.some((p) => p.statusProducao === "Disponível para instalar"),
    valorTotal: pecas.reduce((soma, p) => soma + (p.valor || 0), 0),
    valorFechado: pecas.filter((p) => !!p.vendaFeitaEm).reduce((soma, p) => soma + (p.valor || 0), 0),
    descontoPendente: pecas.some((p) => !p.vendaFeitaEm && p.desconto?.status === "pendente"),
  };
}

// Mesma transformação usada por loadIndex() e pelas atualizações que chegam
// via Realtime — mantida num só lugar pra lista/Funil/Painel nunca ficarem
// com uma linha calculada de um jeito diferente do resto.
function rowParaIndexItem(r) {
  return {
    id: r.id,
    numero: r.numero,
    cliente: r.cliente,
    cpf: r.cpf || "",
    telefone: r.telefone || "",
    criadoEm: r.criado_em,
    status: r.status,
    vendedor: r.vendedor,
    perdidoEm: r.status === "Orçamento Perdido" ? r.perdido_em || null : null,
    ...flagsDeAmbientes(r.ambientes),
  };
}

export async function loadIndex() {
  const { data, error } = await supabase
    .from("pedidos")
    .select("id,numero,cliente,cpf,telefone,criado_em,status,vendedor,perdido_em,ambientes")
    .order("numero", { ascending: false });
  if (error) {
    console.error("loadIndex:", error.message);
    return [];
  }
  return data.map(rowParaIndexItem);
}

/* Histórico de vendas (tabela `vendas`, mantida por gatilho no banco — ver
   supabase/historico.sql). Devolve null se a tabela ainda não existir (aí o
   app volta a somar abrindo pedido por pedido). */
export async function loadVendasHistorico() {
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("vendas")
      .select("peca_id,pedido_numero,cliente,ambiente,codigo,produto,vendedor,valor,vendido_em,disponivel_em,instalado_em")
      .order("vendido_em", { ascending: false })
      .range(de, de + 999);
    if (error) return null;
    linhas.push(...data);
    if (data.length < 1000) break;
  }
  return linhas;
}
// Valor de cada orçamento no dia em que foi marcado como perdido (por pedido).
export async function loadPerdidosHistorico() {
  const { data, error } = await supabase.from("pedidos_perdidos").select("pedido_id,valor");
  if (error) return null;
  const mapa = {};
  data.forEach((r) => {
    mapa[r.pedido_id] = Number(r.valor);
  });
  return mapa;
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
  const linha = pedidoParaLinha(pedido);
  let { error } = await supabase.from("pedidos").upsert(linha);
  if (error && /orcamentos/i.test(error.message || "") && linha.orcamentos) {
    // Coluna ainda não existe: grava o resto normalmente (sem as versões).
    console.warn("savePedido: coluna 'orcamentos' ausente — rode supabase/orcamentos.sql");
    const { orcamentos, ...semOrc } = linha;
    ({ error } = await supabase.from("pedidos").upsert(semOrc));
  }
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
  return { id: data.id, nome: data.nome, login: data.login, papel: data.papel, ativo: data.ativo, cor: data.cor || null, foto: data.foto || null };
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
  return data.map((u) => ({ id: u.id, nome: u.nome, login: u.login, papel: u.papel, ativo: u.ativo, cor: u.cor || null, foto: u.foto || null }));
}

// Cada pessoa escolhe a própria cor de destaque no Menu de usuário — nunca
// a de outra conta. Passa pela função `atualizar_minha_cor` (RPC), que só
// altera a linha de quem está logado, sem abrir uma política de UPDATE
// ampla na tabela perfis.
export async function atualizarMinhaCor(cor) {
  const { error } = await supabase.rpc("atualizar_minha_cor", { nova_cor: cor });
  if (error) {
    console.error("atualizarMinhaCor:", error.message);
    return false;
  }
  return true;
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

/* ------------------------------------------------------------
   TEMPO REAL (Supabase Realtime)
   ------------------------------------------------------------
   Ouve as tabelas `pedidos`, `eventos` e `perfis` via replicação lógica
   (publicação `supabase_realtime`, já habilitada no banco) e repassa cada
   mudança pronta para uso: linha de pedido já convertida em item de índice
   (rowParaIndexItem) e em pedido completo (linhaParaPedido), evento e
   perfil já convertidos também. Assim, quando um vendedor cria uma ficha
   num aparelho, os outros aparelhos abertos recebem o dado na hora, sem
   precisar recarregar a página. RLS continua valendo: cada sessão só
   recebe eventos das linhas que o próprio usuário tem permissão de ver.
   ------------------------------------------------------------ */
export function subscribeRealtime({ onPedidoChange, onEventoChange, onPerfilChange } = {}) {
  const channel = supabase
    .channel("miriam-rios-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, (payload) => {
      if (!onPedidoChange) return;
      if (payload.eventType === "DELETE") {
        onPedidoChange({ tipo: "DELETE", id: payload.old?.id });
        return;
      }
      const row = payload.new;
      onPedidoChange({
        tipo: payload.eventType, // INSERT | UPDATE
        id: row.id,
        indexItem: rowParaIndexItem(row),
        pedido: linhaParaPedido(row),
      });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, (payload) => {
      if (!onEventoChange) return;
      if (payload.eventType === "DELETE") {
        onEventoChange({ tipo: "DELETE", id: payload.old?.id });
        return;
      }
      onEventoChange({ tipo: payload.eventType, evento: linhaParaEvento(payload.new) });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "perfis" }, (payload) => {
      if (!onPerfilChange) return;
      if (payload.eventType === "DELETE") {
        onPerfilChange({ tipo: "DELETE", id: payload.old?.id });
        return;
      }
      const u = payload.new;
      onPerfilChange({
        tipo: payload.eventType,
        usuario: { id: u.id, nome: u.nome, login: u.login, papel: u.papel, ativo: u.ativo, cor: u.cor || null, foto: u.foto || null },
      });
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* ------------------------------------------------------------
   PREÇOS DO ORÇAMENTO (materiais de cortina)
   ------------------------------------------------------------
   Ficam na tabela `precos_orcamento`, não no código — assim, quando a
   loja manda uma lista de preços atualizada, é só aplicar no banco (uma
   migração/SQL), sem precisar tocar no App.jsx nem gerar um novo build.
   O app carrega essa tabela uma vez no login e usa os valores lidos;
   se a tabela estiver vazia ou inacessível, os preços combinados na
   implementação original (App.jsx) continuam valendo como reserva, então
   o Orçamento nunca fica sem preço nenhum.
   ------------------------------------------------------------ */
export async function loadPrecosOrcamento() {
  const { data, error } = await supabase.from("precos_orcamento").select("chave,preco");
  if (error) {
    console.error("loadPrecosOrcamento:", error.message);
    return {};
  }
  const mapa = {};
  data.forEach((r) => {
    mapa[r.chave] = Number(r.preco);
  });
  return mapa;
}

/* ------------------------------------------------------------
   CLIENTES (tela só para Gestor/Gestor Master)
   ------------------------------------------------------------
   O cadastro é automático ao criar um pedido (registrarCliente, função
   Postgres que não repete CPF) e também pode ser feito à mão na tela.
   ------------------------------------------------------------ */
function linhaParaCliente(r) {
  return { id: r.id, nome: r.nome, cpf: r.cpf || "", telefone: r.telefone || "", endereco: r.endereco || "", vendedor: r.vendedor || "", criadoEm: r.criado_em };
}
export async function loadClientes() {
  const { data, error } = await supabase.from("clientes").select("*").order("nome", { ascending: true });
  if (error) {
    console.error("loadClientes:", error.message);
    return [];
  }
  return data.map(linhaParaCliente);
}
export async function registrarCliente({ nome, cpf, telefone, endereco, vendedor }) {
  const { data, error } = await supabase.rpc("registrar_cliente_v2", {
    p_nome: nome,
    p_cpf: cpf || "",
    p_telefone: telefone || "",
    p_endereco: endereco || "",
    p_vendedor: vendedor || "",
  });
  if (error) {
    console.error("registrarCliente:", error.message);
    return { ok: false };
  }
  return { ok: true, ...data };
}
// Cliente novo passa pela mesma regra anti-duplicidade do cadastro automático.
// Edição de cliente existente só bloqueia CPF repetido (índice único no banco).
export async function salvarCliente(c) {
  if (!c.id) {
    const r = await registrarCliente({ nome: c.nome, cpf: c.cpf, telefone: c.telefone, endereco: c.endereco, vendedor: c.vendedor });
    if (!r.ok) return { ok: false };
    if (!r.criado) return { ok: false, duplicado: true, motivo: r.motivo, nomeExistente: r.nome };
    return { ok: true };
  }
  const row = {
    nome: c.nome.trim(),
    cpf: (c.cpf || "").replace(/\D/g, "") || null,
    telefone: (c.telefone || "").replace(/\D/g, "") || null,
    endereco: (c.endereco || "").trim() || null,
    vendedor: c.vendedor || null,
  };
  const { error } = await supabase.from("clientes").update(row).eq("id", c.id);
  if (error) {
    console.error("salvarCliente:", error.message);
    return { ok: false, duplicado: error.code === "23505", motivo: "cpf" };
  }
  return { ok: true };
}

/* ------------------------------------------------------------
   PERFIL (foto de rosto e senha própria) e exclusão de usuário
   ------------------------------------------------------------ */
export async function atualizarMinhaFoto(fotoDataUrl) {
  const { error } = await supabase.rpc("atualizar_minha_foto", { nova_foto: fotoDataUrl });
  if (error) {
    console.error("atualizarMinhaFoto:", error.message);
    return false;
  }
  return true;
}
// Cada pessoa troca a própria senha direto no Supabase Auth.
export async function alterarMinhaSenha(novaSenha) {
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) throw error;
  return true;
}
// Exclusão definitiva da conta: passa pela Edge Function `manage-user` (precisa
// do privilégio de administrador para apagar o login de verdade).
export async function excluirUsuario(id) {
  const { data, error } = await supabase.functions.invoke("manage-user", { body: { acao: "excluir", id } });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context.json();
      if (j?.erro) msg = j.erro;
    } catch (e) {}
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
  return true;
}
// Junta dois clientes em um: apaga o "removido" e grava os dados já combinados
// no "mantido" (só gestores têm permissão, pela RLS da tabela).
export async function juntarClientes({ manterId, removerId, dados }) {
  if (removerId) {
    const { error: e1 } = await supabase.from("clientes").delete().eq("id", removerId);
    if (e1) {
      console.error("juntarClientes/apagar:", e1.message);
      return false;
    }
  }
  const row = {
    nome: dados.nome.trim(),
    cpf: (dados.cpf || "").replace(/\D/g, "") || null,
    telefone: (dados.telefone || "").replace(/\D/g, "") || null,
    endereco: (dados.endereco || "").trim() || null,
    vendedor: dados.vendedor || null,
  };
  const { error } = await supabase.from("clientes").update(row).eq("id", manterId);
  if (error) {
    console.error("juntarClientes/atualizar:", error.message);
    return false;
  }
  return true;
}

// Exclusão definitiva do pedido (só Gestor/Gestor Master, pela RLS). Os
// agendamentos do pedido somem junto (on delete cascade na tabela eventos).
export async function excluirPedido(id) {
  const { error } = await supabase.from("pedidos").delete().eq("id", id);
  if (error) {
    console.error("excluirPedido:", error.message);
    return false;
  }
  return true;
}

// Busca de cliente já cadastrado por CPF ou telefone (Novo pedido).
export async function buscarClientePorDocumento(termo) {
  const { data, error } = await supabase.rpc("buscar_cliente_para_pedido", { p_termo: termo });
  if (error) {
    console.error("buscarClientePorDocumento:", error.message);
    return [];
  }
  return data || [];
}
