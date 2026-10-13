import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  loadIndex,
  saveIndex,
  loadPedido,
  savePedido,
  nextNumero,
  getSessaoAtual,
  carregarPerfil,
  fazerLogin,
  fazerLogout,
  loadUsuarios,
  criarUsuario,
  editarUsuario,
  loadEventos,
  inserirEvento,
  removerEvento,
} from "./lib/db";
import { supabase } from "./lib/supabaseClient";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Lock,
  Plus,
  ArrowLeft,
  Check,
  Clock,
  X,
  Factory,
  Truck,
  LogOut,
  Users as UsersIcon,
  Eye,
  EyeOff,
  Trash2,
  CalendarDays,
  CalendarPlus,
  Info,
} from "lucide-react";

/* ============================================================
   TOKENS
   ============================================================ */
const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');";

const MODELOS = {
  Cortina: ["Trilho suíço", "Tubo vazado", "Varão", "Trilho comando", "Motorizado"],
  Persiana: ["Horizontal", "Vertical", "Rolo", "Romana", "Painel", "Box", "Motorizada"],
};

/* Perfis de acesso. Vêm de um usuário autenticado de verdade (Supabase
   Auth + tabela `perfis`), não mais autodeclarados na entrada do app. */
const PAPEIS = ["Gestor Master", "Gestor", "Vendedor", "Fábrica", "Instalador"];

/* Status do pedido (etapa comercial/agenda). Não é mais um campo livre:
   é derivado automaticamente dos dados (medição salva, valor preenchido,
   evento de agenda, peça em produção/disponível). A única escolha manual é
   marcar/desmarcar "Orçamento Perdido" — o resto o sistema descobre sozinho. */
const STATUS_PEDIDO = [
  "Agendar Medição",
  "Medida Agendada",
  "Medida Feita",
  "Orçamento Passado",
  "Em produção",
  "Parcialmente Fabricado",
  "Disponível para instalar",
  "Orçamento Perdido",
];
function statusPedidoColor(status) {
  return (
    {
      // Sem nenhuma medição ainda (nem agendada, nem feita): tag amarela.
      "Agendar Medição": "var(--amber)",
      "Medida Agendada": "var(--amber)",
      "Medida Feita": "var(--success)",
      "Orçamento Passado": "#6B3FA0",
      "Em produção": "var(--accent)",
      "Parcialmente Fabricado": "var(--orange)",
      "Disponível para instalar": "var(--success)",
      "Orçamento Perdido": "var(--ink-soft)",
    }[status] || "var(--ink-soft)"
  );
}
/* Regra (nesta ordem, a primeira que bater vence):
   1. "Orçamento Perdido" é a única escolha manual — fica travada até
      alguém reativar o pedido explicitamente.
   2. Tem peça "Disponível para instalar" E outra ainda "Em produção" →
      "Parcialmente Fabricado" (fabricação começou a sair, mas não terminou).
   3. Todas as peças que já entraram em produção estão "Disponível para
      instalar" (nenhuma mais "Em produção") → "Disponível para instalar".
   4. Só tem peça "Em produção", nenhuma disponível ainda → "Em produção".
   5. Algum valor de peça preenchido → "Orçamento Passado".
   6. Alguma medição salva (qualquer quantidade) → "Medida Feita" — não
      faz sentido pedir para agendar medição se pelo menos uma já foi tirada.
   7. Existe uma "Medida" agendada na agenda para este pedido → "Medida Agendada".
   8. Nada disso → "Agendar Medição".
*/
function derivarStatusPedido(pedido, eventos) {
  if (pedido.status === "Orçamento Perdido") return "Orçamento Perdido";

  const pecas = pedido.ambientes.flatMap((a) => a.pecas);

  const temDisponivel = pecas.some((p) => p.statusProducao === "Disponível para instalar");
  const temEmProducao = pecas.some((p) => p.statusProducao === "Em produção");

  if (temDisponivel && temEmProducao) return "Parcialmente Fabricado";
  if (temDisponivel) return "Disponível para instalar";
  if (temEmProducao) return "Em produção";

  const temValor = pecas.some((p) => p.valor != null);
  if (temValor) return "Orçamento Passado";

  const temMedicaoSalva = pecas.some((p) => p.locked);
  if (temMedicaoSalva) return "Medida Feita";

  const temMedicaoAgendada = eventos.some((e) => e.pedidoId === pedido.id && e.tipo === "Medida");
  if (temMedicaoAgendada) return "Medida Agendada";

  return "Agendar Medição";
}
/* Fábrica enxerga pedidos nessas três etapas de produção (nada antes, nada
   de perdido/orçamento) e, dentro deles, o pedido completo — mas nunca
   valores (isso já é travado por canVerValores em toda a interface). */
const STATUS_VISIVEIS_FABRICA = ["Em produção", "Parcialmente Fabricado", "Disponível para instalar"];
function statusVisivelParaFabrica(status) {
  return STATUS_VISIVEIS_FABRICA.includes(status);
}

/* Migração leve: peças criadas antes de um campo existir (valor, produção,
   histórico...) não têm essa chave gravada. Preenche com o padrão de peça
   nova, sem apagar nada que já exista — assim o campo de Valor (e outros)
   aparece normalmente mesmo em peças antigas. */
function normalizarPeca(p) {
  return {
    ...p,
    largura: p.largura ?? null,
    altura: p.altura ?? null,
    alturaCurta: p.alturaCurta ?? null,
    observacoes: p.observacoes ?? "",
    locked: p.locked ?? false,
    savedBy: p.savedBy ?? null,
    savedAt: p.savedAt ?? null,
    produto: p.produto ?? null,
    modelo: p.modelo ?? null,
    valor: p.valor ?? null,
    historico: p.historico ?? [],
    statusProducao: p.statusProducao ?? null,
    producaoPor: p.producaoPor ?? null,
    producaoEm: p.producaoEm ?? null,
    disponivelPor: p.disponivelPor ?? null,
    disponivelEm: p.disponivelEm ?? null,
  };
}
function normalizarPedido(pedido) {
  return {
    ...pedido,
    ambientes: pedido.ambientes.map((a) => ({
      ...a,
      seq: a.seq || { J: 0, P: 0 },
      pecas: a.pecas.map(normalizarPeca),
    })),
  };
}

/* ============================================================
   HELPERS
   ============================================================ */
function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function pedidoLabel(numero) {
  return `PEDIDO #${String(numero).padStart(4, "0")}`;
}
function fmtMedida(v) {
  if (v == null || Number.isNaN(v)) return "";
  return v.toFixed(2).replace(".", ",");
}
/* Digit-shift mask for measurement fields: digits fill in from the right,
   e.g. typing 3, 2, 0 in sequence produces 0,03 -> 0,32 -> 3,20 */
function numToDigits(v) {
  if (v == null || Number.isNaN(v)) return "";
  return String(Math.round(v * 100));
}
function digitsToNum(raw) {
  if (!raw) return null;
  return parseInt(raw, 10) / 100;
}
function digitsFromInput(str, maxLen = 6) {
  let d = String(str).replace(/\D/g, "");
  d = d.replace(/^0+/, "");
  if (d.length > maxLen) d = d.slice(-maxLen);
  return d;
}
function formatFromDigits(raw) {
  if (!raw) return "";
  const n = parseInt(raw, 10);
  return (n / 100).toFixed(2).replace(".", ",");
}
/* Mesma máscara de dígitos, formatada como dinheiro (R$ 1.234,56). */
function fmtValor(v) {
  if (v == null || Number.isNaN(v)) return "";
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatValorFromDigits(raw) {
  if (!raw) return "";
  const n = parseInt(raw, 10);
  return "R$ " + (n / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function nowParts() {
  const d = new Date();
  return {
    iso: d.toISOString(),
    data: d.toLocaleDateString("pt-BR"),
    hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}
/* Data local em "YYYY-MM-DD" (evita o desvio de dia do toISOString, que usa UTC). */
function fmtISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}
/* Grade de 42 dias (6 semanas) cobrindo o mês inteiro, com dias das
   semanas anteriores/seguintes para completar as linhas. */
function buildMonthGrid(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const start = new Date(year, month, 1 - startWeekday);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    days.push({ date: d, inMonth: d.getMonth() === month });
  }
  return days;
}
function canEditStructure(papel) {
  return papel === "Vendedor" || papel === "Gestor" || papel === "Gestor Master";
}
function canEditMedicao(peca, papel) {
  if (papel === "Fábrica" || papel === "Instalador") return false;
  if (!peca.locked) return papel === "Vendedor" || papel === "Gestor" || papel === "Gestor Master";
  return papel === "Gestor" || papel === "Gestor Master";
}
/* Cortina "fechada" (medição já salva) pode ser mandada para produção
   por quem vende/gerencia. Só Fábrica/Gestor/Gestor Master tiram a peça
   da produção e liberam para o instalador — Vendedor nunca faz isso. */
function canEnviarProducao(papel) {
  return papel === "Vendedor" || papel === "Gestor" || papel === "Gestor Master";
}
function canAvancarInstalar(papel) {
  return papel === "Fábrica" || papel === "Gestor" || papel === "Gestor Master";
}
function canVerComercial(papel) {
  return papel !== "Fábrica";
}
/* Valor da peça (preço): só quem vende/gerencia enxerga ou mexe. Fábrica e
   Instalador nunca veem preço — nem na lista, nem na ficha, nem no total. */
function canVerValores(papel) {
  return papel === "Vendedor" || papel === "Gestor" || papel === "Gestor Master";
}
function canGerenciarUsuarios(papel) {
  return papel === "Gestor Master" || papel === "Gestor";
}
function canEditarUsuarioCompleto(papel) {
  return papel === "Gestor Master";
}
/* Agendamento de medição x instalação tem donos diferentes: quem vende/mede
   agenda a medição; quem produz/libera agenda a instalação. Instalador só
   consulta a própria agenda, nunca cria ou apaga um compromisso. */
function canAgendarMedida(papel) {
  return canEditStructure(papel);
}
function canAgendarInstalacao(papel) {
  return canAvancarInstalar(papel);
}
function canAgendar(papel) {
  return canAgendarMedida(papel) || canAgendarInstalacao(papel);
}
/* Excluir uma peça é uma alteração estrutural. Depois que a medição já foi
   salva, só Gestor/Gestor Master apagam — mesma lógica de bloqueio já usada
   para editar uma medição salva. */
function canDeletePeca(peca, papel) {
  if (peca.locked) return papel === "Gestor" || papel === "Gestor Master";
  return canEditStructure(papel);
}
function canVerCalendario(papel) {
  return papel !== "Fábrica";
}

/* ============================================================
   CAMADA DE DADOS
   ------------------------------------------------------------
   loadIndex, saveIndex, loadPedido, savePedido, nextNumero,
   getSessaoAtual, carregarPerfil, fazerLogin, fazerLogout,
   loadUsuarios, criarUsuario, editarUsuario, loadEventos,
   inserirEvento, removerEvento — tudo isso agora mora em
   src/lib/db.js e fala com o Supabase de verdade.
   ============================================================ */

/* ============================================================
   ROOT APP
   ============================================================ */
export default function App() {
  const [booting, setBooting] = useState(true);
  const [usuarios, setUsuarios] = useState([]);
  const [session, setSession] = useState(null);
  const [route, setRoute] = useState({ screen: "lista" });
  const [index, setIndex] = useState([]);
  const [pedido, setPedido] = useState(null);
  const [loadingPedido, setLoadingPedido] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [eventos, setEventos] = useState([]);

  useEffect(() => {
    (async () => {
      const sessaoAuth = await getSessaoAtual();
      if (sessaoAuth) {
        const perfil = await carregarPerfil(sessaoAuth.user.id);
        if (perfil && perfil.ativo !== false) setSession(perfil);
      }
      const idx = await loadIndex();
      setIndex(idx);
      setEventos(await loadEventos());
      setBooting(false);
    })();

    // Mantém a sessão sincronizada se o token expirar/renovar em outra aba,
    // ou se a pessoa for deslogada pelo próprio Supabase (ex.: sessão revogada).
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, sessaoAuth) => {
      if (!sessaoAuth) {
        setSession(null);
        return;
      }
      const perfil = await carregarPerfil(sessaoAuth.user.id);
      setSession(perfil && perfil.ativo !== false ? perfil : null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const refreshIndex = useCallback(async () => {
    setIndex(await loadIndex());
  }, []);

  const refreshUsuarios = useCallback(async () => {
    const list = await loadUsuarios();
    setUsuarios(list);
    return list;
  }, []);

  const openPedido = useCallback(
    async (id) => {
      setLoadingPedido(true);
      setRoute({ screen: "pedido", pedidoId: id });
      let p = await loadPedido(id);
      if (p) {
        const normalizado = normalizarPedido(p);
        const final = { ...normalizado, status: derivarStatusPedido(normalizado, eventos) };
        if (JSON.stringify(final) !== JSON.stringify(p)) {
          // Corrige pedidos/peças antigos: campos que não existiam quando
          // foram criados (valor, produção, status...) entram com o padrão
          // de item novo, e o status é recalculado.
          p = final;
          await savePedido(p);
          setIndex((prev) => {
            const next = prev.map((e) => (e.id === p.id ? { ...e, status: p.status } : e));
            saveIndex(next);
            return next;
          });
        } else {
          p = final;
        }
      }
      setPedido(p);
      setLoadingPedido(false);
    },
    [eventos]
  );

  const persistPedido = useCallback(
    async (updated) => {
      // Normaliza (peças antigas ganham os campos que faltam, ex.: valor) e
      // deriva o status dos dados — só "Orçamento Perdido" é manual.
      const normalizado = normalizarPedido(updated);
      const finalPedido = { ...normalizado, status: derivarStatusPedido(normalizado, eventos) };
      setPedido(finalPedido);
      await savePedido(finalPedido);
      // Mantém o índice leve sincronizado com o status — é o único
      // sinalizador usado para filtrar/etiquetar a lista por perfil (ex.:
      // Instalador só vê "Disponível para instalar", Fábrica só vê as
      // etapas de produção).
      setIndex((prev) => {
        const next = prev.map((e) => (e.id === finalPedido.id ? { ...e, status: finalPedido.status } : e));
        saveIndex(next);
        return next;
      });
    },
    [eventos]
  );

  // Agenda: criar/excluir eventos (medição ou instalação). Agendar ou
  // remover uma "Medida" pode mudar o status automático do pedido, então
  // recalculamos com a mesma regra usada em qualquer outra alteração.
  const recalcularStatusPedido = useCallback(async (pedidoId, eventosAtuais) => {
    const alvo = await loadPedido(pedidoId);
    if (!alvo) return;
    const statusCorreto = derivarStatusPedido(alvo, eventosAtuais);
    if (alvo.status === statusCorreto) return;
    const atualizado = { ...alvo, status: statusCorreto };
    await savePedido(atualizado);
    setPedido((prev) => (prev && prev.id === atualizado.id ? atualizado : prev));
    setIndex((prev) => {
      const nextIdx = prev.map((e) => (e.id === atualizado.id ? { ...e, status: atualizado.status } : e));
      saveIndex(nextIdx);
      return nextIdx;
    });
  }, []);

  const criarEvento = useCallback(
    async (evento) => {
      await inserirEvento(evento);
      setEventos((prev) => [...prev, evento]);
      if (evento.tipo === "Medida") {
        await recalcularStatusPedido(evento.pedidoId, [...eventos, evento]);
      }
    },
    [eventos, recalcularStatusPedido]
  );

  const excluirEvento = useCallback(
    async (eventoId) => {
      const removido = eventos.find((e) => e.id === eventoId);
      await removerEvento(eventoId);
      const next = eventos.filter((e) => e.id !== eventoId);
      setEventos(next);
      if (removido && removido.tipo === "Medida") {
        await recalcularStatusPedido(removido.pedidoId, next);
      }
    },
    [eventos, recalcularStatusPedido]
  );

  const handleLogin = async (loginInput, senhaInput) => {
    const perfil = await fazerLogin(loginInput, senhaInput);
    if (!perfil) return false;
    setSession(perfil);
    return true;
  };

  const handleLogout = async () => {
    await fazerLogout();
    setSession(null);
    setShowUserMenu(false);
    setRoute({ screen: "lista" });
  };

  if (booting) {
    return (
      <Shell>
        <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--ink-soft)" }}>Carregando…</div>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <LoginScreen onLogin={handleLogin} />
      </Shell>
    );
  }

  return (
    <Shell
      session={session}
      onOpenUserMenu={() => setShowUserMenu(true)}
      onOpenCalendario={() => setRoute({ screen: "calendario" })}
      onGoHome={() => setRoute({ screen: "lista" })}
      showHome={route.screen !== "lista"}
    >
      {showUserMenu && (
        <UserMenuOverlay
          session={session}
          onClose={() => setShowUserMenu(false)}
          onLogout={handleLogout}
          onOpenUsuarios={
            canGerenciarUsuarios(session.papel)
              ? () => {
                  setShowUserMenu(false);
                  setRoute({ screen: "usuarios" });
                }
              : null
          }
        />
      )}

      {route.screen === "lista" && (
        <PedidosList
          index={index}
          papel={session.papel}
          onOpen={openPedido}
          onCreated={async (id) => {
            await refreshIndex();
            openPedido(id);
          }}
        />
      )}

      {route.screen === "pedido" && (
        loadingPedido || !pedido ? (
          <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--ink-soft)" }}>Carregando pedido…</div>
        ) : (
          <PedidoDetail
            pedido={pedido}
            papel={session.papel}
            nome={session.nome}
            onChange={persistPedido}
            onOpenPeca={(ambienteId, pecaId) =>
              setRoute({ screen: "ficha", pedidoId: pedido.id, ambienteId, pecaId })
            }
            eventos={eventos.filter((e) => e.pedidoId === pedido.id)}
            onCriarEvento={criarEvento}
            onExcluirEvento={excluirEvento}
            onAbrirCalendario={() => setRoute({ screen: "calendario" })}
          />
        )
      )}

      {route.screen === "ficha" && pedido && (
        <FichaPeca
          pedido={pedido}
          ambienteId={route.ambienteId}
          pecaId={route.pecaId}
          papel={session.papel}
          nome={session.nome}
          onChange={persistPedido}
          onBack={() => setRoute({ screen: "pedido", pedidoId: pedido.id })}
        />
      )}

      {route.screen === "usuarios" && canGerenciarUsuarios(session.papel) && (
        <UsuariosScreen
          session={session}
          usuarios={usuarios}
          onBack={() => setRoute({ screen: "lista" })}
          onUsuariosChange={refreshUsuarios}
        />
      )}

      {route.screen === "calendario" && canVerCalendario(session.papel) && (
        <CalendarScreen
          eventos={eventos}
          index={index}
          papel={session.papel}
          nome={session.nome}
          onCriarEvento={criarEvento}
          onExcluirEvento={excluirEvento}
          onBack={() => setRoute({ screen: "lista" })}
          onAbrirPedido={(pedidoId) => {
            openPedido(pedidoId);
          }}
        />
      )}
    </Shell>
  );
}

/* ============================================================
   SHELL / CHROME
   ============================================================ */
function Shell({ children, session, onOpenUserMenu, onOpenCalendario, onGoHome, showHome }) {
  return (
    <div style={{ fontFamily: "var(--sans)", background: "var(--bg)", minHeight: "100%", color: "var(--ink)" }}>
      <style>{`
        ${FONT_IMPORT}
        :root {
          --bg: #F5F1E7;
          --surface: #FFFFFF;
          --ink: #22241F;
          --ink-soft: #6B6C60;
          --line: #DBD3BF;
          --accent: #28466A;
          --accent-ink: #FFFFFF;
          --accent-soft: #E4EAF0;
          --locked: #97372A;
          --locked-soft: #F3E3DF;
          --success: #3E6B50;
          --success-soft: #E4EDE6;
          --amber: #B8860B;
          --amber-soft: #F5ECD6;
          --orange: #C1631A;
          --orange-soft: #F3E1CF;
          --mono: 'IBM Plex Mono', ui-monospace, monospace;
          --sans: 'IBM Plex Sans', system-ui, sans-serif;
        }
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        input, select, textarea { font-family: inherit; }
        input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible {
          outline: 2px solid var(--accent); outline-offset: 1px;
        }
        .container { max-width: 640px; margin: 0 auto; padding: 0 14px 64px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      <header
        style={{
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          className="container"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px" }}
        >
          <div
            onClick={onGoHome}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: showHome ? "pointer" : "default" }}
          >
            {showHome && <ArrowLeft size={18} color="var(--ink-soft)" />}
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.2px" }}>Medição de Ambientes</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>cortinas · persianas · decoração</div>
            </div>
          </div>
          {session && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {canVerCalendario(session.papel) && (
                <button
                  onClick={onOpenCalendario}
                  title="Calendário"
                  style={{
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    borderRadius: 4,
                    padding: "7px 8px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <CalendarDays size={16} color="var(--ink-soft)" />
                </button>
              )}
              <button
                onClick={onOpenUserMenu}
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  borderRadius: 4,
                  padding: "6px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <RoleDot papel={session.papel} />
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{session.nome}</span>
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="container">{children}</div>
    </div>
  );
}

function RoleDot({ papel }) {
  const colors = {
    "Vendedor": "#28466A",
    "Gestor": "#97372A",
    "Gestor Master": "#6B3FA0",
    "Fábrica": "#3E6B50",
    "Instalador": "#B8860B",
  };
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: colors[papel] || "#999",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

function StatusPedidoBadge({ status }) {
  return <span style={statusBadgeStyle(statusPedidoColor(status))}>{status}</span>;
}

/* ============================================================
   LOGIN
   ============================================================ */
function LoginScreen({ onLogin }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  const handleSubmit = async () => {
    if (!login.trim() || !senha || entrando) return;
    setErro("");
    setEntrando(true);
    const ok = await onLogin(login, senha);
    setEntrando(false);
    if (!ok) setErro("Usuário ou senha inválidos.");
  };

  return (
    <div style={{ padding: "40px 4px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Entrar no sistema</h1>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 24 }}>
        Use o usuário e senha cadastrados pelo seu gestor.
      </p>

      <label style={labelStyle}>Nome de usuário</label>
      <input
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="Ex.: Alexis Machado"
        autoCapitalize="none"
        style={inputStyle()}
      />

      <label style={{ ...labelStyle, marginTop: 14 }}>Senha</label>
      <div style={{ position: "relative" }}>
        <input
          type={showSenha ? "text" : "password"}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Senha"
          style={{ ...inputStyle(), paddingRight: 38 }}
        />
        <button
          type="button"
          onClick={() => setShowSenha((v) => !v)}
          aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            padding: 6,
            color: "var(--ink-soft)",
          }}
        >
          {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {erro && <div style={{ ...missingTextStyle, marginTop: 10 }}>{erro}</div>}

      <button
        disabled={!login.trim() || !senha || entrando}
        onClick={handleSubmit}
        style={primaryBtnStyle(!login.trim() || !senha || entrando)}
      >
        {entrando ? "Entrando…" : "Entrar"}
      </button>
    </div>
  );
}

/* ============================================================
   MENU DE USUÁRIO (sessão atual)
   ============================================================ */
function UserMenuOverlay({ session, onClose, onLogout, onOpenUsuarios }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,18,0.4)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          width: "100%",
          maxWidth: 640,
          borderRadius: "10px 10px 0 0",
          padding: 20,
          borderTop: "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RoleDot papel={session.papel} />
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{session.nome}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{session.papel}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", padding: 4 }}>
            <X size={18} color="var(--ink-soft)" />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {onOpenUsuarios && (
            <button onClick={onOpenUsuarios} style={{ ...ghostBtnStyle, justifyContent: "flex-start" }}>
              <UsersIcon size={15} /> Gerenciar usuários
            </button>
          )}
          <button onClick={onLogout} style={{ ...ghostBtnStyle, justifyContent: "flex-start", color: "var(--locked)" }}>
            <LogOut size={15} /> Sair
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   USUÁRIOS (Gestor Master / Gestor)
   ============================================================ */
function UsuariosScreen({ session, usuarios, onBack, onUsuariosChange }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    onUsuariosChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirNovo = () => {
    setEditing(null);
    setShowForm(true);
  };
  const abrirEdicao = (u) => {
    setEditing(u);
    setShowForm(true);
  };

  return (
    <div style={{ paddingTop: 18 }}>
      <button onClick={onBack} style={{ ...ghostBtnStyle, marginBottom: 14 }}>
        <ArrowLeft size={14} /> Voltar
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Usuários</h1>
        {!showForm && (
          <button onClick={abrirNovo} style={ghostBtnStyle}>
            <Plus size={15} /> Novo usuário
          </button>
        )}
      </div>

      {showForm && (
        <UsuarioForm
          session={session}
          editing={editing}
          onCancel={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            setEditing(null);
            await onUsuariosChange();
          }}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {usuarios.map((u) => {
          const podeEditar =
            canGerenciarUsuarios(session.papel) &&
            !(u.papel === "Gestor Master" && session.papel !== "Gestor Master");
          return (
            <div
              key={u.id}
              style={{
                ...cardStyle,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <RoleDot papel={u.papel} />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{u.nome}</span>
                  {u.ativo === false && <span style={{ fontSize: 10.5, color: "var(--locked)" }}>(inativo)</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
                  @{u.login} · {u.papel}
                </div>
              </div>
              {podeEditar && (
                <button onClick={() => abrirEdicao(u)} style={smallActionStyle}>
                  Editar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UsuarioForm({ session, editing, onCancel, onSaved }) {
  const isMaster = canEditarUsuarioCompleto(session.papel);
  // "Gestor pode criar novos logins mas não pode alterar o tipo": ao editar um
  // usuário já existente, só o Gestor Master pode mudar o perfil.
  const papelTravado = !!editing && !isMaster;

  const [nome, setNome] = useState(editing?.nome || "");
  const [login, setLogin] = useState(editing?.login || "");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState(editing?.papel || "Vendedor");
  const [ativo, setAtivo] = useState(editing ? editing.ativo !== false : true);
  const [erro, setErro] = useState("");
  const [saving, setSaving] = useState(false);

  // Um Gestor comum não pode promover ninguém a Gestor Master.
  const papeisPermitidos = isMaster ? PAPEIS : PAPEIS.filter((p) => p !== "Gestor Master");

  const canSave = nome.trim() && login.trim() && (editing ? true : senha.trim().length >= 4);

  const handleSave = async () => {
    if (!canSave || saving) return;
    setErro("");
    setSaving(true);
    try {
      if (editing) {
        const patch = { id: editing.id, nome: nome.trim(), login: login.trim(), ativo };
        if (!papelTravado) patch.papel = papel;
        if (senha.trim()) patch.novaSenha = senha.trim();
        await editarUsuario(patch);
      } else {
        await criarUsuario({
          nome: nome.trim(),
          login: login.trim(),
          senha: senha.trim(),
          papel,
          criadoPor: session.nome,
        });
      }
      setSaving(false);
      onSaved();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar. Tente novamente.");
      setSaving(false);
    }
  };

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>{editing ? "Editar usuário" : "Novo usuário"}</div>

      <label style={labelStyle}>Nome</label>
      <input value={nome} onChange={(e) => setNome(e.target.value)} style={inputStyle()} placeholder="Nome completo" />

      <label style={{ ...labelStyle, marginTop: 10 }}>Nome de usuário (login)</label>
      <input
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        style={inputStyle()}
        placeholder="Ex.: joao.silva"
        autoCapitalize="none"
      />

      <label style={{ ...labelStyle, marginTop: 10 }}>{editing ? "Nova senha (opcional)" : "Senha"}</label>
      <input
        type="password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        style={inputStyle()}
        placeholder={editing ? "Deixe em branco para manter a atual" : "Mínimo 4 caracteres"}
      />

      <label style={{ ...labelStyle, marginTop: 12 }}>Perfil</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {papeisPermitidos.map((p) => (
          <button
            key={p}
            type="button"
            disabled={papelTravado}
            onClick={() => setPapel(p)}
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: papel === p ? "1.5px solid var(--accent)" : "1px solid var(--line)",
              background: papel === p ? "var(--accent-soft)" : "var(--surface)",
              fontSize: 12,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 5,
              opacity: papelTravado ? 0.6 : 1,
            }}
          >
            <RoleDot papel={p} /> {p}
          </button>
        ))}
      </div>
      {papelTravado && (
        <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
          Somente o Gestor Master pode alterar o perfil de um usuário já existente.
        </div>
      )}

      {editing && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12.5 }}>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Usuário ativo (permite login)
        </label>
      )}

      {erro && <div style={{ ...missingTextStyle, marginTop: 10 }}>{erro}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={{ ...ghostBtnStyle, flex: 1, justifyContent: "center" }}>
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          style={{ ...primaryBtnStyle(!canSave || saving), flex: 1, marginTop: 0 }}
        >
          {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar usuário"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   CALENDÁRIO / AGENDA
   ============================================================ */
function CalendarScreen({ eventos, index, papel, nome, onCriarEvento, onExcluirEvento, onBack, onAbrirPedido }) {
  const hoje = new Date();
  const [mesRef, setMesRef] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [diaSelecionado, setDiaSelecionado] = useState(fmtISODate(hoje));
  const [showForm, setShowForm] = useState(false);

  const eventosPorDia = useMemo(() => {
    const map = {};
    eventos.forEach((e) => {
      (map[e.data] = map[e.data] || []).push(e);
    });
    return map;
  }, [eventos]);

  const dias = useMemo(() => buildMonthGrid(mesRef), [mesRef]);
  const hojeISO = fmtISODate(hoje);
  const eventosDoDia = (eventosPorDia[diaSelecionado] || [])
    .slice()
    .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

  return (
    <div style={{ paddingTop: 18 }}>
      <button onClick={onBack} style={{ ...ghostBtnStyle, marginBottom: 14 }}>
        <ArrowLeft size={14} /> Voltar
      </button>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>Calendário</h1>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => setMesRef(addMonths(mesRef, -1))} style={smallActionStyle}>
          <ChevronLeft size={14} />
        </button>
        <div style={{ fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>
          {mesRef.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </div>
        <button onClick={() => setMesRef(addMonths(mesRef, 1))} style={smallActionStyle}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10.5, color: "var(--ink-soft)", fontWeight: 600 }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {dias.map(({ date, inMonth }) => {
          const iso = fmtISODate(date);
          const evs = eventosPorDia[iso] || [];
          const isToday = iso === hojeISO;
          const isSelected = iso === diaSelecionado;
          return (
            <button
              key={iso}
              onClick={() => setDiaSelecionado(iso)}
              style={{
                aspectRatio: "1",
                borderRadius: 6,
                border: isSelected ? "1.5px solid var(--accent)" : "1px solid var(--line)",
                background: isToday ? "var(--accent-soft)" : "var(--surface)",
                opacity: inMonth ? 1 : 0.35,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                padding: 2,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500 }}>{date.getDate()}</span>
              {evs.length > 0 && (
                <span style={{ display: "flex", gap: 2 }}>
                  {evs.some((e) => e.tipo === "Medida") && (
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--accent)" }} />
                  )}
                  {evs.some((e) => e.tipo === "Instalação") && (
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--success)" }} />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>
            {new Date(diaSelecionado + "T00:00:00").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </div>
          {canAgendar(papel) && !showForm && (
            <button onClick={() => setShowForm(true)} style={ghostBtnStyle}>
              <Plus size={14} /> Agendar
            </button>
          )}
        </div>

        {showForm && (
          <AgendarForm
            index={index}
            papel={papel}
            nome={nome}
            dataPreset={diaSelecionado}
            onCancel={() => setShowForm(false)}
            onSaved={async (evento) => {
              setShowForm(false);
              await onCriarEvento(evento);
            }}
          />
        )}

        {eventosDoDia.length === 0 && !showForm && <div style={emptyStateStyle}>Nada agendado neste dia.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {eventosDoDia.map((e) => (
            <div
              key={e.id}
              style={{
                ...cardStyle,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                padding: "10px 14px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={statusBadgeStyle(e.tipo === "Medida" ? "var(--accent)" : "var(--success)")}>{e.tipo}</span>
                  {e.hora && <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{e.hora}</span>}
                </div>
                <button
                  onClick={() => onAbrirPedido(e.pedidoId)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    marginTop: 4,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--ink)",
                    textAlign: "left",
                  }}
                >
                  {pedidoLabel(e.pedidoNumero)} — {e.cliente}
                </button>
                {e.observacao && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>{e.observacao}</div>}
              </div>
              {canAgendar(papel) && (
                <button
                  onClick={() => onExcluirEvento(e.id)}
                  title="Remover agendamento"
                  style={{ background: "none", border: "none", padding: 4, color: "var(--ink-soft)" }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgendarForm({ index, papel, nome, pedidoPreset, dataPreset, onCancel, onSaved }) {
  const tiposPermitidos = [canAgendarMedida(papel) && "Medida", canAgendarInstalacao(papel) && "Instalação"].filter(
    Boolean
  );

  const [pedidoId, setPedidoId] = useState(pedidoPreset?.id || "");
  const [tipo, setTipo] = useState(tiposPermitidos[0] || "Medida");
  const [data, setData] = useState(dataPreset || fmtISODate(new Date()));
  const [hora, setHora] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  const pedidoEscolhido = pedidoPreset || index.find((p) => p.id === pedidoId);
  const canSave = !!pedidoEscolhido && !!data && tiposPermitidos.length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    await onSaved({
      id: uid(),
      pedidoId: pedidoEscolhido.id,
      pedidoNumero: pedidoEscolhido.numero,
      cliente: pedidoEscolhido.cliente,
      tipo,
      data,
      hora: hora || null,
      observacao: observacao.trim(),
      criadoPor: nome,
      criadoEm: nowParts().iso,
    });
    setSaving(false);
  };

  if (tiposPermitidos.length === 0) {
    return <div style={emptyStateStyle}>Seu perfil não pode criar agendamentos.</div>;
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      {!pedidoPreset && (
        <>
          <label style={labelStyle}>Pedido</label>
          <select value={pedidoId} onChange={(e) => setPedidoId(e.target.value)} style={inputStyle()}>
            <option value="">Selecione o pedido…</option>
            {index
              .slice()
              .sort((a, b) => b.numero - a.numero)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {pedidoLabel(p.numero)} — {p.cliente}
                </option>
              ))}
          </select>
        </>
      )}

      {tiposPermitidos.length > 1 && (
        <>
          <label style={{ ...labelStyle, marginTop: 10 }}>Tipo</label>
          <div style={{ display: "flex", gap: 8 }}>
            {tiposPermitidos.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                style={{
                  flex: 1,
                  padding: "8px 6px",
                  borderRadius: 6,
                  border: tipo === t ? "1.5px solid var(--accent)" : "1px solid var(--line)",
                  background: tipo === t ? "var(--accent-soft)" : "var(--surface)",
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Data</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={inputStyle()} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Hora (opcional)</label>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={inputStyle()} />
        </div>
      </div>

      <label style={{ ...labelStyle, marginTop: 10 }}>Observação</label>
      <input
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        style={inputStyle()}
        placeholder="Ex.: preferência de horário, ponto de referência…"
      />

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={{ ...ghostBtnStyle, flex: 1, justifyContent: "center" }}>
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          style={{ ...primaryBtnStyle(!canSave || saving), flex: 1, marginTop: 0 }}
        >
          {saving ? "Agendando…" : "Agendar"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   PEDIDOS LIST
   ============================================================ */
function PedidosList({ index, papel, onOpen, onCreated }) {
  const [showForm, setShowForm] = useState(false);
  const visiveis =
    papel === "Instalador"
      ? index.filter((p) => p.status === "Disponível para instalar")
      : papel === "Fábrica"
      ? index.filter((p) => statusVisivelParaFabrica(p.status))
      : index;
  const sorted = [...visiveis].sort((a, b) => b.numero - a.numero);

  return (
    <div style={{ paddingTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Pedidos</h1>
        {canEditStructure(papel) && (
          <button onClick={() => setShowForm(true)} style={ghostBtnStyle}>
            <Plus size={15} /> Novo pedido
          </button>
        )}
      </div>

      {showForm && (
        <NovoPedidoForm
          papel={papel}
          onCancel={() => setShowForm(false)}
          onCreated={(id) => {
            setShowForm(false);
            onCreated(id);
          }}
        />
      )}

      {sorted.length === 0 && !showForm && (
        <div style={emptyStateStyle}>
          {papel === "Instalador"
            ? "Nenhum pedido disponível para instalar/entregar no momento."
            : papel === "Fábrica"
            ? "Nenhum pedido em produção no momento."
            : "Nenhum pedido cadastrado ainda."}
          {canEditStructure(papel) && ' Toque em "Novo pedido" para começar uma medição.'}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen(p.id)}
            style={{
              textAlign: "left",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "12px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)" }}>
                {pedidoLabel(p.numero)}
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 2 }}>{p.cliente}</div>
              {/* Um único selo de status por pedido: "Em produção" e "Disponível para
                  instalar" já são valores do próprio status (derivarStatusPedido), então
                  não existe mais um segundo selo repetindo a mesma informação. */}
              <div style={{ marginTop: 4 }}>
                <StatusPedidoBadge status={p.status || "Agendar Medição"} />
              </div>
            </div>
            <ChevronRight size={18} color="var(--ink-soft)" />
          </button>
        ))}
      </div>
    </div>
  );
}

function NovoPedidoForm({ papel, onCancel, onCreated }) {
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = cliente.trim().length > 0;

  const handleCreate = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const numero = await nextNumero();
    const pedido = {
      id: uid(),
      numero,
      cliente: cliente.trim(),
      telefone: telefone.trim(),
      endereco: endereco.trim(),
      vendedor: vendedor.trim(),
      criadoEm: nowParts().iso,
      status: "Agendar Medição",
      ambientes: [],
    };
    await savePedido(pedido);
    setSaving(false);
    onCreated(pedido.id);
  };

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Novo pedido</div>
      <label style={labelStyle}>Nome do cliente</label>
      <input value={cliente} onChange={(e) => setCliente(e.target.value)} style={inputStyle()} placeholder="Ex.: João da Silva" />
      <label style={{ ...labelStyle, marginTop: 10 }}>Telefone</label>
      <input value={telefone} onChange={(e) => setTelefone(e.target.value)} style={inputStyle()} placeholder="(00) 00000-0000" />
      <label style={{ ...labelStyle, marginTop: 10 }}>Endereço da obra</label>
      <input value={endereco} onChange={(e) => setEndereco(e.target.value)} style={inputStyle()} placeholder="Rua, número, bairro" />
      <label style={{ ...labelStyle, marginTop: 10 }}>Vendedor responsável</label>
      <input value={vendedor} onChange={(e) => setVendedor(e.target.value)} style={inputStyle()} placeholder="Nome do vendedor" />

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={{ ...ghostBtnStyle, flex: 1, justifyContent: "center" }}>
          Cancelar
        </button>
        <button
          onClick={handleCreate}
          disabled={!canSave || saving}
          style={{ ...primaryBtnStyle(!canSave || saving), flex: 1, marginTop: 0 }}
        >
          {saving ? "Criando…" : "Criar pedido"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   PEDIDO DETAIL — accordion of ambientes
   ============================================================ */
function PedidoDetail({
  pedido,
  papel,
  nome,
  onChange,
  onOpenPeca,
  eventos = [],
  onCriarEvento,
  onExcluirEvento,
  onAbrirCalendario,
}) {
  const [expanded, setExpanded] = useState(() => new Set(pedido.ambientes.slice(0, 1).map((a) => a.id)));
  const [showNovoAmbiente, setShowNovoAmbiente] = useState(false);
  const [showAgendaForm, setShowAgendaForm] = useState(false);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addAmbiente = (nomeAmbiente) => {
    const novo = { id: uid(), nome: nomeAmbiente, seq: { J: 0, P: 0 }, pecas: [] };
    const updated = { ...pedido, ambientes: [...pedido.ambientes, novo] };
    onChange(updated);
    setExpanded((prev) => new Set(prev).add(novo.id));
    setShowNovoAmbiente(false);
  };

  const addPeca = (ambienteId, tipo) => {
    const key = tipo === "Janela" ? "J" : "P";
    const updated = {
      ...pedido,
      ambientes: pedido.ambientes.map((a) => {
        if (a.id !== ambienteId) return a;
        const seq = { ...a.seq, [key]: (a.seq[key] || 0) + 1 };
        const codigo = `${key}${pad2(seq[key])}`;
        const peca = {
          id: uid(),
          tipo,
          codigo,
          largura: null,
          altura: null,
          alturaCurta: null,
          observacoes: "",
          locked: false,
          savedBy: null,
          savedAt: null,
          produto: null,
          modelo: null,
          valor: null,
          historico: [],
          statusProducao: null,
          producaoPor: null,
          producaoEm: null,
          disponivelPor: null,
          disponivelEm: null,
        };
        return { ...a, seq, pecas: [...a.pecas, peca] };
      }),
    };
    onChange(updated);
  };

  const updatePeca = (ambienteId, pecaId, patch) => {
    const updated = {
      ...pedido,
      ambientes: pedido.ambientes.map((a) =>
        a.id !== ambienteId
          ? a
          : { ...a, pecas: a.pecas.map((p) => (p.id === pecaId ? { ...p, ...patch } : p)) }
      ),
    };
    onChange(updated);
  };

  const deletePeca = (ambienteId, pecaId) => {
    const updated = {
      ...pedido,
      ambientes: pedido.ambientes.map((a) =>
        a.id !== ambienteId ? a : { ...a, pecas: a.pecas.filter((p) => p.id !== pecaId) }
      ),
    };
    onChange(updated);
  };

  // Status é automático (ver derivarStatusPedido) — a única ação manual
  // possível aqui é marcar/reativar "Orçamento Perdido".
  const statusAtual = pedido.status || "Agendar Medição";
  const marcarOrcamentoPerdido = () => onChange({ ...pedido, status: "Orçamento Perdido" });
  const reativarPedido = () => onChange({ ...pedido, status: null });

  const todasPecas = pedido.ambientes.flatMap((a) => a.pecas);
  const pendentesProducao = todasPecas.filter((p) => p.locked && !p.statusProducao).length;
  const emProducaoCount = todasPecas.filter((p) => p.statusProducao === "Em produção").length;
  const valorTotal = todasPecas.reduce((soma, p) => soma + (p.valor || 0), 0);
  const temValorLancado = todasPecas.some((p) => p.valor != null);
  // Valor fechado: soma só das peças que já foram (ou estão sendo) mandadas
  // para produção — é o que o vendedor efetivamente fechou com o cliente,
  // diferente do valor total (que inclui peças ainda em orçamento).
  const valorFechado = todasPecas
    .filter((p) => !!p.statusProducao)
    .reduce((soma, p) => soma + (p.valor || 0), 0);

  const enviarConcluidosParaProducao = () => {
    const { iso } = nowParts();
    const updated = {
      ...pedido,
      ambientes: pedido.ambientes.map((a) => ({
        ...a,
        pecas: a.pecas.map((p) =>
          p.locked && !p.statusProducao
            ? { ...p, statusProducao: "Em produção", producaoPor: nome, producaoEm: iso }
            : p
        ),
      })),
    };
    onChange(updated);
  };

  const marcarObraDisponivel = () => {
    const { iso } = nowParts();
    const updated = {
      ...pedido,
      ambientes: pedido.ambientes.map((a) => ({
        ...a,
        pecas: a.pecas.map((p) =>
          p.statusProducao === "Em produção"
            ? { ...p, statusProducao: "Disponível para instalar", disponivelPor: nome, disponivelEm: iso }
            : p
        ),
      })),
    };
    onChange(updated);
  };

  const showContact = canVerComercial(papel);

  // Instalador só enxerga peças já liberadas para instalação/entrega.
  const ambientesVisiveis =
    papel === "Instalador"
      ? pedido.ambientes
          .map((a) => ({ ...a, pecas: a.pecas.filter((p) => p.statusProducao === "Disponível para instalar") }))
          .filter((a) => a.pecas.length > 0)
      : pedido.ambientes;

  const eventosOrdenados = eventos.slice().sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")));

  return (
    <div style={{ paddingTop: 18 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)" }}>{pedidoLabel(pedido.numero)}</div>
      <h1 style={{ fontSize: 19, fontWeight: 600, marginTop: 2, marginBottom: 8 }}>{pedido.cliente}</h1>
      {(showContact || (canVerValores(papel) && temValorLancado)) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            {showContact && pedido.telefone && <div>{pedido.telefone}</div>}
            {showContact && pedido.endereco && <div>{pedido.endereco}</div>}
            {showContact && pedido.vendedor && <div>Vendedor: {pedido.vendedor}</div>}
          </div>
          {canVerValores(papel) && temValorLancado && (
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.6, textAlign: "right", flexShrink: 0 }}>
              <div>
                Valor total: <strong style={{ color: "var(--ink)" }}>{fmtValor(valorTotal)}</strong>
              </div>
              {valorFechado > 0 && (
                <div>
                  Valor fechado: <strong style={{ color: "var(--ink)" }}>{fmtValor(valorFechado)}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <StatusPedidoBadge status={statusAtual} />
        {canEditStructure(papel) &&
          (statusAtual === "Orçamento Perdido" ? (
            <button onClick={reativarPedido} style={smallActionStyle}>
              Reativar pedido
            </button>
          ) : (
            <button onClick={marcarOrcamentoPerdido} style={{ ...smallActionStyle, color: "var(--locked)" }}>
              Marcar orçamento perdido
            </button>
          ))}
      </div>

      {canEnviarProducao(papel) && pendentesProducao > 0 && (
        <button onClick={enviarConcluidosParaProducao} style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center", marginBottom: 8 }}>
          <Factory size={14} /> Enviar {pendentesProducao} peça(s) concluída(s) para produção
        </button>
      )}
      {canAvancarInstalar(papel) && emProducaoCount > 0 && (
        <button onClick={marcarObraDisponivel} style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center", marginBottom: 8, color: "var(--success)" }}>
          <Truck size={14} /> Marcar {emProducaoCount} peça(s) disponível para instalar
        </button>
      )}

      {canVerCalendario(papel) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" }}>Agenda</div>
            <button onClick={onAbrirCalendario} style={{ background: "none", border: "none", padding: 0, fontSize: 11.5, color: "var(--accent)", fontWeight: 500 }}>
              Ver calendário completo
            </button>
          </div>

          {eventosOrdenados.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              {eventosOrdenados.map((e) => (
                <div key={e.id} style={{ ...cardStyle, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={statusBadgeStyle(e.tipo === "Medida" ? "var(--accent)" : "var(--success)")}>{e.tipo}</span>
                    <span style={{ fontSize: 12.5 }}>
                      {new Date(e.data + "T00:00:00").toLocaleDateString("pt-BR")}
                      {e.hora ? ` às ${e.hora}` : ""}
                    </span>
                  </div>
                  {canAgendar(papel) && (
                    <button onClick={() => onExcluirEvento(e.id)} style={{ background: "none", border: "none", padding: 4, color: "var(--ink-soft)" }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canAgendar(papel) &&
            (showAgendaForm ? (
              <AgendarForm
                index={[{ id: pedido.id, numero: pedido.numero, cliente: pedido.cliente }]}
                pedidoPreset={{ id: pedido.id, numero: pedido.numero, cliente: pedido.cliente }}
                papel={papel}
                nome={nome}
                onCancel={() => setShowAgendaForm(false)}
                onSaved={async (evento) => {
                  setShowAgendaForm(false);
                  await onCriarEvento(evento);
                }}
              />
            ) : (
              <button onClick={() => setShowAgendaForm(true)} style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center" }}>
                <CalendarPlus size={14} /> Agendar medição/instalação
              </button>
            ))}
        </div>
      )}

      {ambientesVisiveis.length === 0 && (
        <div style={emptyStateStyle}>
          {papel === "Instalador"
            ? "Nenhuma peça disponível para instalar/entregar neste pedido ainda."
            : "Nenhum ambiente cadastrado."}
          {canEditStructure(papel) && ambientesVisiveis.length === 0 && ' Adicione o primeiro ambiente da obra abaixo.'}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
        {ambientesVisiveis.map((amb) => (
          <AmbienteAccordion
            key={amb.id}
            ambiente={amb}
            open={expanded.has(amb.id)}
            onToggle={() => toggle(amb.id)}
            papel={papel}
            nome={nome}
            onAddPeca={(tipo) => addPeca(amb.id, tipo)}
            onUpdatePeca={(pecaId, patch) => updatePeca(amb.id, pecaId, patch)}
            onDeletePeca={(pecaId) => deletePeca(amb.id, pecaId)}
            onOpenPeca={(pecaId) => onOpenPeca(amb.id, pecaId)}
          />
        ))}
      </div>

      {canEditStructure(papel) && (
        <div style={{ marginTop: 14 }}>
          {showNovoAmbiente ? (
            <NovoAmbienteInline onCancel={() => setShowNovoAmbiente(false)} onCreate={addAmbiente} />
          ) : (
            <button onClick={() => setShowNovoAmbiente(true)} style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center" }}>
              <Plus size={15} /> Adicionar ambiente
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NovoAmbienteInline({ onCancel, onCreate }) {
  const [val, setVal] = useState("");
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  const submit = () => {
    if (val.trim()) onCreate(val.trim());
  };
  const BTN_HEIGHT = 38;
  const X_WIDTH = 38;
  const CHECK_WIDTH = X_WIDTH * 2;

  return (
    <div style={{ ...cardStyle, display: "flex", gap: 8 }}>
      <input
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Nome do ambiente (ex.: Suíte)"
        style={{ ...inputStyle(), flex: 1, minWidth: 0, height: BTN_HEIGHT, padding: "0 10px" }}
      />
      <button
        onClick={submit}
        style={{
          ...primaryBtnStyle(!val.trim()),
          marginTop: 0,
          width: CHECK_WIDTH,
          height: BTN_HEIGHT,
          padding: 0,
          flexShrink: 0,
        }}
      >
        <Check size={16} />
      </button>
      <button
        onClick={onCancel}
        style={{
          ...ghostBtnStyle,
          width: X_WIDTH,
          height: BTN_HEIGHT,
          padding: 0,
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

/* ============================================================
   AMBIENTE ACCORDION + peças table
   ============================================================ */
function AmbienteAccordion({ ambiente, open, onToggle, papel, nome, onAddPeca, onUpdatePeca, onDeletePeca, onOpenPeca }) {
  const count = ambiente.pecas.length;
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          background: "none",
          border: "none",
          borderLeft: "3px solid var(--accent)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>{ambiente.nome}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            {count} {count === 1 ? "peça" : "peças"}
          </span>
          {open ? <ChevronDown size={17} color="var(--ink-soft)" /> : <ChevronRight size={17} color="var(--ink-soft)" />}
        </span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "10px 12px 12px" }}>
          {ambiente.pecas.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", padding: "6px 2px 10px" }}>
              Nenhuma peça neste ambiente ainda.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ambiente.pecas.map((p) => (
                <PecaRow
                  key={p.id}
                  peca={p}
                  papel={papel}
                  nome={nome}
                  onUpdate={(patch) => onUpdatePeca(p.id, patch)}
                  onDelete={() => onDeletePeca(p.id)}
                  onOpen={() => onOpenPeca(p.id)}
                />
              ))}
            </div>
          )}

          {canEditStructure(papel) && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => onAddPeca("Janela")} style={{ ...ghostBtnStyle, flex: 1, justifyContent: "center" }}>
                <Plus size={14} /> Janela
              </button>
              <button onClick={() => onAddPeca("Porta")} style={{ ...ghostBtnStyle, flex: 1, justifyContent: "center" }}>
                <Plus size={14} /> Porta
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MEDIÇÃO — shared draft/save logic
   ------------------------------------------------------------
   Enquanto a peça não foi salva (locked === false), largura, altura,
   altura curta e observações vivem apenas no estado local do formulário.
   Nada é persistido campo a campo. Só "Salvar medição" grava tudo de
   uma vez (valida largura/altura, trava a peça, registra savedBy/savedAt).

   Depois de salva, o Gestor pode corrigir campo a campo — cada alteração
   confirmada (onBlur) é persistida individualmente e gera uma entrada de
   histórico própria, sem apagar o histórico anterior.
   ============================================================ */
function useMedicaoDraft(peca, papel, nome, onUpdate) {
  const [larguraRaw, setLarguraRaw] = useState(numToDigits(peca.largura));
  const [alturaRaw, setAlturaRaw] = useState(numToDigits(peca.altura));
  const [alturaCurtaRaw, setAlturaCurtaRaw] = useState(numToDigits(peca.alturaCurta));
  const [obs, setObs] = useState(peca.observacoes || "");
  const [attemptedSave, setAttemptedSave] = useState(false);

  useEffect(() => {
    setLarguraRaw(numToDigits(peca.largura));
    setAlturaRaw(numToDigits(peca.altura));
    setAlturaCurtaRaw(numToDigits(peca.alturaCurta));
    setObs(peca.observacoes || "");
  }, [peca.largura, peca.altura, peca.alturaCurta, peca.observacoes]);

  const applyChange = (field, val) => {
    const before = peca[field];
    if (before === val) return;
    if (peca.locked && (papel === "Gestor" || papel === "Gestor Master")) {
      const { data, hora } = nowParts();
      const historico = [
        ...peca.historico,
        {
          usuario: nome,
          data,
          hora,
          campo: fieldLabel(field),
          de: field === "observacoes" ? before || "—" : fmtMedida(before) || "—",
          para: field === "observacoes" ? val || "—" : fmtMedida(val) || "—",
        },
      ];
      onUpdate({ [field]: val, historico });
    } else {
      onUpdate({ [field]: val });
    }
  };

  // Campo a campo só persiste depois que a medição já foi salva (correção do Gestor).
  // Em rascunho (peça ainda não bloqueada), não faz nada — o valor fica só localmente.
  const commitField = (field, raw) => {
    if (!peca.locked) return;
    applyChange(field, digitsToNum(raw));
  };
  const commitObs = () => {
    if (!peca.locked) return;
    applyChange("observacoes", obs);
  };

  const missing = attemptedSave
    ? [digitsToNum(larguraRaw) == null && "Largura", digitsToNum(alturaRaw) == null && "Altura"].filter(Boolean)
    : [];

  const handleConcluir = () => {
    const w = digitsToNum(larguraRaw);
    const h = digitsToNum(alturaRaw);
    if (w == null || h == null) {
      setAttemptedSave(true);
      return;
    }
    const { iso } = nowParts();
    onUpdate({
      largura: w,
      altura: h,
      alturaCurta: digitsToNum(alturaCurtaRaw),
      observacoes: obs,
      locked: true,
      savedBy: nome,
      savedAt: iso,
    });
  };

  return {
    larguraRaw,
    setLarguraRaw,
    alturaRaw,
    setAlturaRaw,
    alturaCurtaRaw,
    setAlturaCurtaRaw,
    obs,
    setObs,
    commitField,
    commitObs,
    handleConcluir,
    missing,
  };
}

/* ============================================================
   PEÇA ROW — inline measurement entry (compact, table view)
   ============================================================ */
function PecaRow({ peca, papel, nome, onUpdate, onDelete, onOpen }) {
  const editable = canEditMedicao(peca, papel);
  const d = useMedicaoDraft(peca, papel, nome, onUpdate);
  const [confirmando, setConfirmando] = useState(false);
  const podeExcluir = canDeletePeca(peca, papel);

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "8px 10px",
        background: peca.locked ? "var(--bg)" : "var(--surface)",
      }}
    >
      {confirmando && (
        <ConfirmDialog
          title={`Excluir ${peca.tipo.toLowerCase()} ${peca.codigo}?`}
          message={
            peca.statusProducao
              ? `Essa peça já foi enviada para produção (${peca.statusProducao}). Excluir remove permanentemente a medição, o histórico e o andamento dela. Essa ação não pode ser desfeita.`
              : "Essa ação remove a peça e sua medição permanentemente e não pode ser desfeita."
          }
          confirmLabel="Excluir peça"
          onConfirm={() => {
            setConfirmando(false);
            onDelete();
          }}
          onCancel={() => setConfirmando(false)}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <button
          onClick={onOpen}
          style={{
            fontFamily: "var(--mono)",
            fontSize: 13,
            fontWeight: 600,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            border: "none",
            borderRadius: 4,
            padding: "3px 8px",
          }}
          title="Abrir ficha da peça"
        >
          {peca.codigo}
        </button>
        <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{peca.tipo}</span>
        <span style={{ flex: 1 }} />
        {peca.locked && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--locked)" }}>
            <Lock size={12} /> {papel === "Gestor" || papel === "Gestor Master" ? "editável (gestor)" : "bloqueada"}
          </span>
        )}
        {podeExcluir && (
          <button
            onClick={() => setConfirmando(true)}
            title="Excluir peça"
            style={{ background: "none", border: "none", padding: 3, color: "var(--ink-soft)", display: "flex" }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
        <MedidaField
          label="Largura"
          raw={d.larguraRaw}
          setRaw={d.setLarguraRaw}
          disabled={!editable}
          error={d.missing.includes("Largura")}
          onBlur={() => d.commitField("largura", d.larguraRaw)}
        />
        <MedidaField
          label="Altura"
          raw={d.alturaRaw}
          setRaw={d.setAlturaRaw}
          disabled={!editable}
          error={d.missing.includes("Altura")}
          onBlur={() => d.commitField("altura", d.alturaRaw)}
        />
        <MedidaField
          label="Alt. curta"
          raw={d.alturaCurtaRaw}
          setRaw={d.setAlturaCurtaRaw}
          disabled={!editable}
          onBlur={() => d.commitField("alturaCurta", d.alturaCurtaRaw)}
          optional
        />
      </div>

      <input
        value={d.obs}
        onChange={(e) => d.setObs(e.target.value)}
        onBlur={d.commitObs}
        disabled={!editable}
        placeholder="Observações"
        style={{ ...inputStyle(), fontSize: 12.5, padding: "6px 8px", opacity: editable ? 1 : 0.75 }}
      />

      {canVerValores(papel) && (
        <div style={{ marginTop: 6 }}>
          <ValorPeca peca={peca} onUpdate={onUpdate} />
        </div>
      )}

      {!peca.locked && editable && (
        <>
          <button
            onClick={d.handleConcluir}
            style={{ ...smallActionStyle, marginTop: 6, color: "var(--success)", borderColor: "var(--success-soft)" }}
          >
            <Check size={13} /> Salvar medição
          </button>
          {d.missing.length > 0 && <div style={missingTextStyle}>Preencha: {d.missing.join(", ")}</div>}
        </>
      )}

      <ProducaoControls peca={peca} papel={papel} nome={nome} onUpdate={onUpdate} />

      <button
        onClick={onOpen}
        style={{
          ...ghostBtnStyle,
          width: "100%",
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        <Info size={14} /> Abrir informações da peça
      </button>
    </div>
  );
}

/* ============================================================
   CONFIRMAÇÃO GENÉRICA (usada para excluir peça, etc.)
   ============================================================ */
function ConfirmDialog({ title, message, confirmLabel = "Confirmar", onConfirm, onCancel }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,18,0.45)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", borderRadius: 10, padding: 20, maxWidth: 360, width: "100%" }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 18, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ ...ghostBtnStyle, flex: 1, justifyContent: "center" }}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              background: "var(--locked)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "11px 14px",
              fontSize: 13.5,
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PRODUÇÃO — envio da peça "fechada" para a fábrica e liberação
   para o instalador. Vendedor/Gestor/Gestor Master enviam; só
   Fábrica/Gestor/Gestor Master liberam para instalar (Vendedor não).
   ============================================================ */
function ProducaoControls({ peca, papel, nome, onUpdate }) {
  if (!peca.locked) return null; // só cortina "fechada" (medição salva) vai pra produção

  const enviar = () => {
    const { iso } = nowParts();
    onUpdate({ statusProducao: "Em produção", producaoPor: nome, producaoEm: iso });
  };
  const avancar = () => {
    const { iso } = nowParts();
    onUpdate({ statusProducao: "Disponível para instalar", disponivelPor: nome, disponivelEm: iso });
  };

  if (!peca.statusProducao) {
    if (!canEnviarProducao(papel)) return null;
    return (
      <button
        onClick={enviar}
        style={{ ...smallActionStyle, marginTop: 6, color: "var(--accent)", borderColor: "var(--accent-soft)" }}
      >
        <Factory size={13} /> Enviar para produção
      </button>
    );
  }

  if (peca.statusProducao === "Em produção") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <span style={statusBadgeStyle("var(--accent)")}>
          <Factory size={10} /> Em produção
        </span>
        {canAvancarInstalar(papel) && (
          <button
            onClick={avancar}
            style={{ ...smallActionStyle, color: "var(--success)", borderColor: "var(--success-soft)" }}
          >
            <Truck size={13} /> Disponível p/ instalar
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }}>
      <span style={statusBadgeStyle("var(--success)")}>
        <Truck size={10} /> Disponível para instalar
      </span>
    </div>
  );
}

function fieldLabel(field) {
  return { largura: "Largura", altura: "Altura", alturaCurta: "Altura curta", observacoes: "Observações" }[field] || field;
}

/* ============================================================
   VALOR DA PEÇA — só quem vende/gerencia enxerga esta seção (a
   Ficha já não renderiza ValorPeca para Fábrica/Instalador).
   ============================================================ */
function ValorPeca({ peca, onUpdate }) {
  const [raw, setRaw] = useState(numToDigits(peca.valor));
  const inputRef = useRef(null);

  useEffect(() => {
    setRaw(numToDigits(peca.valor));
  }, [peca.valor]);

  useEffect(() => {
    if (inputRef.current && document.activeElement === inputRef.current) {
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  });

  const commit = () => {
    const val = raw ? digitsToNum(raw) : null;
    if (val !== peca.valor) onUpdate({ valor: val });
  };

  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>Valor (R$)</span>
      <input
        ref={inputRef}
        value={formatValorFromDigits(raw)}
        onChange={(e) => setRaw(digitsFromInput(e.target.value, 9))}
        onBlur={commit}
        inputMode="numeric"
        placeholder="R$ 0,00"
        style={{ ...inputStyle(), fontFamily: "var(--mono)", textAlign: "right" }}
      />
    </label>
  );
}

function MedidaField({ label, raw, setRaw, disabled, error, onBlur, optional }) {
  const inputRef = useRef(null);

  // Keep the caret pinned to the end so new digits keep shifting in from the right.
  useEffect(() => {
    if (inputRef.current && document.activeElement === inputRef.current) {
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  });

  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 10, color: "var(--ink-soft)", display: "block", marginBottom: 2 }}>
        {label}
        {optional ? "" : " *"}
      </span>
      <input
        ref={inputRef}
        value={formatFromDigits(raw)}
        onChange={(e) => setRaw(digitsFromInput(e.target.value))}
        onBlur={onBlur}
        disabled={disabled}
        inputMode="numeric"
        placeholder="0,00"
        style={{
          ...inputStyle(),
          fontFamily: "var(--mono)",
          fontSize: 13,
          padding: "6px 6px",
          textAlign: "right",
          borderColor: error ? "var(--locked)" : "var(--line)",
          opacity: disabled ? 0.75 : 1,
          background: disabled ? "var(--bg)" : "var(--surface)",
        }}
      />
    </label>
  );
}

/* ============================================================
   FICHA INDIVIDUAL DA PEÇA
   ============================================================ */
function FichaPeca({ pedido, ambienteId, pecaId, papel, nome, onChange, onBack }) {
  const ambiente = pedido.ambientes.find((a) => a.id === ambienteId);
  const peca = ambiente?.pecas.find((p) => p.id === pecaId);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  if (!ambiente || !peca) {
    return (
      <div style={{ paddingTop: 18 }}>
        <button onClick={onBack} style={ghostBtnStyle}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <div style={emptyStateStyle}>Peça não encontrada.</div>
      </div>
    );
  }

  const editableEstrutura = canEditStructure(papel);
  const podeExcluir = canDeletePeca(peca, papel);

  const updatePeca = (patch) => {
    const updated = {
      ...pedido,
      ambientes: pedido.ambientes.map((a) =>
        a.id !== ambienteId ? a : { ...a, pecas: a.pecas.map((p) => (p.id === pecaId ? { ...p, ...patch } : p)) }
      ),
    };
    onChange(updated);
  };

  const setProduto = (produto) => updatePeca({ produto, modelo: null });
  const setModelo = (modelo) => updatePeca({ modelo });

  const handleExcluir = () => {
    const updated = {
      ...pedido,
      ambientes: pedido.ambientes.map((a) =>
        a.id !== ambienteId ? a : { ...a, pecas: a.pecas.filter((p) => p.id !== pecaId) }
      ),
    };
    onChange(updated);
    onBack();
  };

  return (
    <div style={{ paddingTop: 18 }}>
      {confirmandoExclusao && (
        <ConfirmDialog
          title={`Excluir ${peca.tipo.toLowerCase()} ${peca.codigo}?`}
          message={
            peca.statusProducao
              ? `Essa peça já foi enviada para produção (${peca.statusProducao}). Excluir remove permanentemente a medição, o histórico e o andamento dela. Essa ação não pode ser desfeita.`
              : "Essa ação remove a peça e sua medição permanentemente e não pode ser desfeita."
          }
          confirmLabel="Excluir peça"
          onConfirm={handleExcluir}
          onCancel={() => setConfirmandoExclusao(false)}
        />
      )}

      <button onClick={onBack} style={{ ...ghostBtnStyle, marginBottom: 14 }}>
        <ArrowLeft size={14} /> Voltar ao pedido
      </button>

      <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-soft)" }}>
        {pedidoLabel(pedido.numero)} → {ambiente.nome}
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 2, marginBottom: 18 }}>
        {peca.codigo}
      </h1>

      <Section title="Identificação">
        <InfoRow label="Pedido" value={pedidoLabel(pedido.numero)} />
        <InfoRow label="Ambiente" value={ambiente.nome} />
        <InfoRow label="Tipo de abertura" value={peca.tipo} />
        <InfoRow label="Código" value={peca.codigo} mono />
      </Section>

      <Section title="Medição">
        <FichaMedicao peca={peca} papel={papel} nome={nome} onUpdate={updatePeca} />
      </Section>

      <Section title="Produção">
        {!peca.locked ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
            Salve a medição para poder enviar esta peça para produção.
          </div>
        ) : (
          <div style={cardStyle}>
            <ProducaoControls peca={peca} papel={papel} nome={nome} onUpdate={updatePeca} />
            {!peca.statusProducao && !canEnviarProducao(papel) && (
              <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Ainda não enviada para produção.</div>
            )}
            {peca.disponivelEm && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-soft)" }}>
                Liberado por {peca.disponivelPor} em {new Date(peca.disponivelEm).toLocaleDateString("pt-BR")}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Produto">
        <div style={{ display: "flex", gap: 8 }}>
          {["Cortina", "Persiana"].map((opt) => (
            <button
              key={opt}
              disabled={!editableEstrutura}
              onClick={() => setProduto(opt)}
              style={{
                flex: 1,
                padding: "10px 6px",
                borderRadius: 6,
                border: peca.produto === opt ? "1.5px solid var(--accent)" : "1px solid var(--line)",
                background: peca.produto === opt ? "var(--accent-soft)" : "var(--surface)",
                fontSize: 13,
                fontWeight: 500,
                opacity: editableEstrutura ? 1 : 0.6,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Modelo">
        {peca.produto ? (
          <select
            value={peca.modelo || ""}
            onChange={(e) => setModelo(e.target.value || null)}
            disabled={!editableEstrutura}
            style={{ ...inputStyle(), opacity: editableEstrutura ? 1 : 0.6 }}
          >
            <option value="">Selecione o modelo…</option>
            {MODELOS[peca.produto].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Selecione um produto primeiro.</div>
        )}
      </Section>

      {canVerValores(papel) && (
        <Section title="Valor">
          <ValorPeca peca={peca} onUpdate={updatePeca} />
        </Section>
      )}

      <Section title="Características de produção">
        <div
          style={{
            border: "1px dashed var(--line)",
            borderRadius: 6,
            padding: "16px 12px",
            fontSize: 12.5,
            color: "var(--ink-soft)",
            textAlign: "center",
          }}
        >
          Os campos específicos de fabricação (tecido, componentes, acessórios etc.) serão adicionados aqui
          futuramente, de acordo com o produto e modelo escolhidos.
        </div>
      </Section>

      {peca.historico.length > 0 && (
        <Section title="Histórico de alterações">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {peca.historico
              .slice()
              .reverse()
              .map((h, i) => (
                <div key={i} style={{ fontSize: 12, border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-soft)", marginBottom: 4 }}>
                    <Clock size={11} />
                    {h.data} {h.hora} · {h.usuario}
                  </div>
                  <div>
                    <strong>{h.campo}</strong>: {h.de} → {h.para}
                  </div>
                </div>
              ))}
          </div>
        </Section>
      )}

      {podeExcluir && (
        <button
          onClick={() => setConfirmandoExclusao(true)}
          style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center", color: "var(--locked)", marginTop: 4 }}
        >
          <Trash2 size={14} /> Excluir esta peça
        </button>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 500, fontFamily: mono ? "var(--mono)" : "inherit" }}>{value}</span>
    </div>
  );
}

/* ============================================================
   FICHA — seção de Medição
   Bloqueada e sem permissão de edição (Vendedor/Fábrica): ficha técnica
   somente leitura, organizada e explícita em metros — nunca mais volta a
   virar formulário editável para o Vendedor depois de salva.
   Em rascunho, ou bloqueada+Gestor: campos editáveis com rótulo em metros.
   ============================================================ */
function FichaMedicao({ peca, papel, nome, onUpdate }) {
  const editable = canEditMedicao(peca, papel);
  const d = useMedicaoDraft(peca, papel, nome, onUpdate);

  if (peca.locked && !editable) {
    const savedDate = peca.savedAt ? new Date(peca.savedAt) : null;
    return (
      <div style={{ ...cardStyle, padding: "6px 14px 14px" }}>
        <FichaMedidaRow label="Largura (m)" value={fmtMedida(peca.largura) || "—"} />
        <FichaMedidaRow label="Altura (m)" value={fmtMedida(peca.altura) || "—"} />
        <FichaMedidaRow label="Altura curta (m)" value={peca.alturaCurta != null ? fmtMedida(peca.alturaCurta) : "—"} />
        <FichaMedidaRow label="Observações" value={peca.observacoes || "—"} last={!savedDate} />
        {savedDate && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 5 }}>
            <Lock size={11} />
            Salvo por {peca.savedBy} em {savedDate.toLocaleDateString("pt-BR")} às{" "}
            {savedDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {peca.locked && (papel === "Gestor" || papel === "Gestor Master") && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--locked)", marginBottom: 12 }}>
          <Lock size={11} /> Medição já salva — qualquer alteração fica registrada no histórico
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <FichaMedidaField
          label="Largura (m)"
          raw={d.larguraRaw}
          setRaw={d.setLarguraRaw}
          error={d.missing.includes("Largura")}
          onBlur={() => d.commitField("largura", d.larguraRaw)}
        />
        <FichaMedidaField
          label="Altura (m)"
          raw={d.alturaRaw}
          setRaw={d.setAlturaRaw}
          error={d.missing.includes("Altura")}
          onBlur={() => d.commitField("altura", d.alturaRaw)}
        />
        <FichaMedidaField
          label="Altura curta (m)"
          raw={d.alturaCurtaRaw}
          setRaw={d.setAlturaCurtaRaw}
          onBlur={() => d.commitField("alturaCurta", d.alturaCurtaRaw)}
          optional
        />
        <label style={{ display: "block" }}>
          <span style={labelStyle}>Observações</span>
          <textarea
            value={d.obs}
            onChange={(e) => d.setObs(e.target.value)}
            onBlur={d.commitObs}
            rows={2}
            placeholder="Particularidades da medição"
            style={{ ...inputStyle(), resize: "vertical" }}
          />
        </label>
      </div>

      {!peca.locked && (
        <>
          <button onClick={d.handleConcluir} style={{ ...primaryBtnStyle(false), marginTop: 14 }}>
            <Check size={15} /> Salvar medição
          </button>
          {d.missing.length > 0 && <div style={{ ...missingTextStyle, textAlign: "center" }}>Preencha: {d.missing.join(", ")}</div>}
        </>
      )}
    </div>
  );
}

function FichaMedidaRow({ label, value, last }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--line)",
      }}
    >
      <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{label}</span>
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          fontFamily: label.startsWith("Observ") ? "inherit" : "var(--mono)",
          textAlign: "right",
          maxWidth: "65%",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function FichaMedidaField({ label, raw, setRaw, onBlur, error, optional }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current && document.activeElement === inputRef.current) {
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  });
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>
        {label}
        {optional ? "" : " *"}
      </span>
      <input
        ref={inputRef}
        value={formatFromDigits(raw)}
        onChange={(e) => setRaw(digitsFromInput(e.target.value))}
        onBlur={onBlur}
        inputMode="numeric"
        placeholder="0,00"
        style={{
          ...inputStyle(),
          fontFamily: "var(--mono)",
          textAlign: "right",
          borderColor: error ? "var(--locked)" : "var(--line)",
        }}
      />
    </label>
  );
}

/* ============================================================
   SHARED STYLES
   ============================================================ */
const labelStyle = { display: "block", fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 4 };
const cardStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 14 };
const emptyStateStyle = {
  fontSize: 13,
  color: "var(--ink-soft)",
  border: "1px dashed var(--line)",
  borderRadius: 8,
  padding: "18px 14px",
  textAlign: "center",
  marginBottom: 12,
};
const ghostBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "7px 12px",
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--ink)",
};
const smallActionStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 5,
  padding: "5px 9px",
  fontSize: 11.5,
  fontWeight: 500,
  color: "var(--ink)",
};
const missingTextStyle = {
  color: "var(--locked)",
  fontSize: 11.5,
  marginTop: 6,
  fontWeight: 500,
};
function statusBadgeStyle(color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10.5,
    fontWeight: 600,
    color,
    background: "var(--bg)",
    border: `1px solid ${color}`,
    borderRadius: 999,
    padding: "2px 8px",
  };
}
function primaryBtnStyle(disabled) {
  return {
    width: "100%",
    marginTop: 16,
    background: disabled ? "#B9BBB1" : "var(--accent)",
    color: "var(--accent-ink)",
    border: "none",
    borderRadius: 6,
    padding: "11px 14px",
    fontSize: 13.5,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
function inputStyle() {
  return {
    width: "100%",
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "9px 10px",
    fontSize: 13.5,
    background: "var(--surface)",
    color: "var(--ink)",
  };
}
