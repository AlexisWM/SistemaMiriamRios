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
  subscribeRealtime,
  loadPrecosOrcamento,
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
  LayoutGrid,
  Menu,
  Search,
  CheckCheck,
  BarChart3,
  ClipboardList,
  Pencil,
  RotateCcw,
  Printer,
} from "lucide-react";

/* ============================================================
   TOKENS
   ============================================================ */
const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');";

// Modelo da Cortina: 6 estruturas de mecanismo. "Trilho suíço" e "Tubo
// Vaza" já têm regra de orçamento completa (mesmo motor de cálculo pros
// dois — só muda a peça de trilho/tubo no resumo). Varão, Trilho curvo,
// Trilho com comando e Motorizado ainda não têm preço/regra definidos.
const MODELOS = {
  Cortina: ["Trilho suíço", "Tubo Vaza", "Varão", "Trilho curvo", "Trilho com comando", "Motorizado"],
  Persiana: ["Horizontal", "Vertical", "Rolo", "Romana", "Painel", "Box", "Motorizada"],
};
// Só esses modelos têm o Orçamento automático por enquanto — os outros
// mostram um aviso "ainda não configurado" e mantêm Valor manual.
const MODELOS_COM_ORCAMENTO = ["Trilho suíço", "Tubo Vaza", "Varão"];

/* ============================================================
   ORÇAMENTO DE CORTINAS — tabela de preços e regras de cálculo
   ------------------------------------------------------------
   Tudo reunido num só lugar pra ficar fácil de ajustar depois (preço
   muda, vira outro número aqui — nada de procurar espalhado pelo
   código). Nenhum preço ou fórmula aqui foi inventado. Onde não havia
   regra/preço definido (Tubo Vaza, quantidade de suporte, metragem de
   fita Wave), o campo fica como "a definir" ou entrada manual em vez de
   calculado sozinho.
   ============================================================ */
// Tipo de trilho (a peça de metal) — só aparece quando Modelo = "Trilho
// suíço". Decide o preço do trilho e o tipo de presilha.
const TIPOS_TRILHO_SUICO = [
  "Trilho simples",
  "Trilho simples extra",
  "Trilho duplo",
  "Trilho duplo c/ aba",
  "Trilho duplo espaçado",
  "Trilho triplo",
];
// Cor do Trilho suíço: só Branco ou Preto — e Preto só existe no Trilho
// simples extra (não tem duplo/triplo em preto). Quando a cor é Preto, o
// seletor de Tipo de Trilho mostra só essa opção.
const TRILHO_CORES = ["Branco", "Preto"];
const TIPOS_TRILHO_COR_PRETA = ["Trilho simples extra"];
function tiposTrilhoDisponiveis(cor) {
  return cor === "Preto" ? TIPOS_TRILHO_COR_PRETA : TIPOS_TRILHO_SUICO;
}
const PRECO_TRILHO = {
  "Trilho simples": 13.9,
  "Trilho simples extra": 18.9,
  "Trilho duplo": 27.8,
  "Trilho duplo c/ aba": 32.0,
  "Trilho duplo espaçado": 35.7,
  "Trilho triplo": 44.7,
};
// Cada trilho usa um tipo de presilha, e a QUANTIDADE agora é calculada
// automaticamente pra todos os tipos, com a mesma regra do trilho simples
// (10cm de cada ponta + uma a cada 40cm, sempre na largura REAL).
const TRILHO_PARA_PRESILHA = {
  "Trilho simples": "Presilha simples",
  "Trilho simples extra": "Presilha simples",
  "Trilho duplo": "Presilha dupla",
  "Trilho duplo c/ aba": "Presilha dupla",
  "Trilho duplo espaçado": "Presilha de trilho triplo",
  "Trilho triplo": "Presilha de trilho triplo",
};
const PRECO_PRESILHA = {
  "Presilha simples": 3.5,
  "Presilha dupla": 4.0,
  "Presilha de trilho triplo": 6.0,
};
// Tubo Vaza — hardware diferente do trilho suíço (tubo redondo, não canal
// metálico), com sua própria variação de diâmetro e cor (preço por metro,
// cobrado igual ao trilho/varão — ver calcularTrilhoCobrado). Todas as
// cores usam a mesma tabela, exceto Ouro Velho, que é mais caro. Preto e
// Rose Gold ainda não têm preço informado pela loja, então ficam "a
// definir" até serem confirmados.
const TUBO_VAZA_DIAMETROS = ["19mm", "28mm"];
const TUBO_VAZA_CORES = ["Cromado", "Aço Escovado", "Ouro Velho", "Preto", "Rose Gold"];
const PRECO_TUBO_VAZA = {
  "19mm|Cromado": 32.0,
  "28mm|Cromado": 39.7,
  "19mm|Aço Escovado": 32.0,
  "28mm|Aço Escovado": 39.7,
  "19mm|Ouro Velho": 37.0,
  "28mm|Ouro Velho": 44.5,
  "19mm|Preto": null, // a definir
  "28mm|Preto": null, // a definir
  "19mm|Rose Gold": null, // a definir
  "28mm|Rose Gold": null, // a definir
};
// Suportes do Tubo Vaza têm catálogo próprio (diferente do genérico usado
// por Trilho suíço) — a loja não informou preço de Triplo ainda, então
// fica "a definir".
const PRECO_SUPORTE_TUBO_VAZA = {
  "Simples 19mm": 21.5,
  "Simples 28mm": 22.4,
  "Simples 19mm Alongado 6cm": 23.9,
  "Simples 28mm Alongado 6cm": 26.9,
  "Duplo": 29.6,
  "Triplo": null, // a definir
};

// Preços "por unidade" que não variam por tipo (deslizante, clip, cordão,
// fita Wave) ficam num objeto mutável — igual aos mapas acima — pra poder
// ser sobrescrito por aplicarPrecosCarregados() sem precisar mudar quem já
// usa PRECO_UNITARIO.deslizante etc.
const PRECO_UNITARIO = {
  deslizante: 0.45,
  clip: 0.55,
  cordaoMetro: 8.9, // igual para Wave 5cm e Wave 6,5cm
  fitaWaveMetro: 6.9,
  gancho: 0.45, // Varão/Argola
};
const PRECO_COZ = { "Transparente": 18.9, "TNT": 3.9, "Tecido": 7.9 };
const PRECO_SUPORTE = { "5x4": 12.0, "4x6": 8.9, "5x7": 4.8 };
// Isto é a distância das ondas no cordão do Wave, não um "tipo" de Wave —
// por isso o rótulo na ficha é "Espaçamento cordão Wave".
const ESPACAMENTOS_CORDAO_WAVE = ["Wave 5cm", "Wave 6,5cm"];
// Acabamento da cortina (só quando Modelo é Trilho suíço ou Tubo Vaza):
// Wave = tecido liso formando ondas puxadas por cordão; Franzido = tecido
// reto franzido por uma fita passada por dentro (como um elástico), sem
// cordão/clips/fita fácil — o deslizante do franzido é costurado direto
// na cortina.
const ACABAMENTOS_CORTINA = ["Wave", "Franzido"];
// Abertura da peça (Trilho suíço, Tubo Vaza ou Varão): quantas folhas a
// cortina se divide fisicamente — escolhida uma vez pra peça inteira,
// igual Material/Cor. Interfere direto no cálculo de Deslizante/Clip/
// Cordão (Wave/Franzido) e de Ilhós/Argola/Gancho (Varão): a largura
// real é dividida em N folhas iguais e a fórmula de cada um desses
// cálculos (que já era "por folha", ver calcularWave/
// calcularIlhosArgolas) é aplicada em cada folha e somada.
const ABERTURAS_CORTINA = [
  { chave: "inteira", label: "Inteira", folhas: 1 },
  { chave: "aberta_meio", label: "Aberta ao Meio", folhas: 2 },
  { chave: "4_aberturas", label: "4 Aberturas", folhas: 3 },
  { chave: "5_aberturas", label: "5 Aberturas", folhas: 4 },
];
function folhasDaAbertura(abertura) {
  const item = ABERTURAS_CORTINA.find((a) => a.chave === abertura);
  return item ? item.folhas : null;
}
const CAMADAS_CORTINA = ["fundo", "forro", "xale"];
const CAMADA_LABEL = { fundo: "Fundo", forro: "Forro", xale: "Xale" };
// Ordem da mais à frente pra mais atrás. Só a camada mais à frente pode
// ser Wave — se ela for Wave, todas as de trás são obrigatoriamente
// Franzido (fisicamente só a camada da frente mostra a onda; as de trás
// precisam ficar franzidas pra caber por baixo sem volume extra).
const ORDEM_FRENTE_CAMADAS = ["xale", "forro", "fundo"];

// Varão — hardware totalmente diferente do trilho/tubo (não usa
// deslizante, clip, fita fácil nem COZ Transparente). Cada camada
// escolhe seu próprio diâmetro e tipo de fixação (Ilhós ou Argola),
// igual já acontece hoje com Wave/Franzido.
// Varão vem em dois materiais, cada um com sua própria lista fixa de
// cores — são linhas de produto diferentes, não uma variação de cor
// dentro do mesmo material.
const VARAO_MATERIAIS = ["Alumínio", "Ferro"];
const VARAO_CORES_ALUMINIO = ["Cromado", "Aço Escovado", "Ouro Velho", "Dourado"];
const VARAO_CORES_FERRO = ["Imbuia", "Mogno", "Branco", "Cerejeira", "Bege"];
function coresVaraoDisponiveis(material) {
  if (material === "Alumínio") return VARAO_CORES_ALUMINIO;
  if (material === "Ferro") return VARAO_CORES_FERRO;
  return [];
}
// Diâmetro disponível também depende do material: Alumínio tem 13/19/28,
// Ferro só tem 19/28 (não existe Varão de Ferro 13mm).
const VARAO_DIAMETROS = ["19mm", "28mm"];
function diametrosVaraoDisponiveis(material) {
  if (material === "Alumínio") return ["13mm", "19mm", "28mm"];
  if (material === "Ferro") return ["19mm", "28mm"];
  return VARAO_DIAMETROS; // material ainda não escolhido — fallback
}
// Diâmetro por camada só é escolhido livremente quando o Suporte da peça
// é Simples (1 varão só). Quando é Duplo/Triplo, o diâmetro de cada
// camada é definido pela combinação do próprio Suporte — ex.: "Duplo
// 19/28mm" sempre vai com 19mm na camada mais atrás (Fundo) e 28mm na
// mais à frente (Forro/Xale) — assim a fábrica sabe exatamente qual
// argola/ilhós/ponteira vai em cada varão, sem depender da vendedora
// escolher certo manualmente. Extrai os diâmetros de um rótulo tipo
// "Duplo 19/28mm" ou "Triplo 19/19/28mm", em ordem crescente (que já
// corresponde à ordem de trás pra frente). Retorna null pra "Simples ..."
// ou qualquer rótulo sem "/" (nada a derivar).
function diametrosDoSuporteMultiplo(tipoSuporte) {
  if (!tipoSuporte) return null;
  const m = /^(?:Duplo|Triplo)\s+([\d/]+)mm/.exec(tipoSuporte);
  if (!m) return null;
  return m[1]
    .split("/")
    .map((d) => d + "mm")
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}
// Suporte "governante" da peça pra fins de diâmetro automático: o
// primeiro Suporte compartilhado Duplo/Triplo da lista da peça — numa
// mesma peça não se mistura combinação diferente de Suporte, então o
// primeiro Duplo/Triplo já define a combinação de diâmetros de todas as
// camadas.
function suporteGovernanteDiametros(orc) {
  const suportes = orc?.suportes || [];
  for (const s of suportes) {
    const diametros = diametrosDoSuporteMultiplo(s.tipo);
    if (diametros) return diametros;
  }
  return null;
}
// Diâmetro efetivo de uma camada do Varão + se ele é automático (vindo
// do Suporte Duplo/Triplo) ou manual (Suporte Simples/nenhum, ou a
// quantidade de diâmetros do Suporte não bate com o número de camadas
// ativas — nesse caso não dá pra saber qual diâmetro vai em qual camada,
// então cai pra manual). `camadasBackToFront` é a lista de chaves de
// camada ativas/não-mescladas, ordenada de trás pra frente (Fundo
// primeiro).
function diametroVaraoInfo(orc, camadasBackToFront, chave, manual) {
  const diametros = suporteGovernanteDiametros(orc);
  if (diametros && diametros.length === camadasBackToFront.length && camadasBackToFront.includes(chave)) {
    return { valor: diametros[camadasBackToFront.indexOf(chave)], automatico: true };
  }
  return { valor: manual, automatico: false };
}
const TIPOS_FIXACAO_VARAO = ["Ilhós", "Argola"];
// Ilhós é sempre PVC, catálogo único por diâmetro independente do
// material do Varão.
const PRECO_ILHOS = { "19mm": 1.2, "28mm": 1.5 };
// Argola varia por material e, só no Alumínio, por Tipo de Argola
// (Metal, PVC ou PVC Frisada) — no Ferro só existe a opção PVC.
const TIPOS_ARGOLA_ALUMINIO = ["Metal", "PVC", "PVC Frisada"];
// chave "{material}|{tipoArgola}|{diametro}"
const PRECO_ARGOLA = {
  "Alumínio|Metal|13mm": 3.0,
  "Alumínio|Metal|19mm": 3.7,
  "Alumínio|Metal|28mm": 4.0,
  "Alumínio|PVC|19mm": 1.4,
  "Alumínio|PVC|28mm": 1.8,
  "Alumínio|PVC Frisada|19mm": 2.1,
  "Alumínio|PVC Frisada|28mm": 2.5,
  "Ferro|PVC|19mm": 0.4,
  "Ferro|PVC|28mm": 0.8,
};
// O Varão em si (a haste) — 1 por camada ativa, cobrado igual ao Trilho
// suíço: arredonda pra cima de 0,50 em 0,50m na largura REAL (3,10m
// cobra 3,50m), e na largura REAL >= 5,00m cobra a barra inteira de
// 6,00m (calcularTrilhoCobrado). Preço varia por material + cor +
// diâmetro (preço por metro).
// chave "{material}|{cor}|{diametro}"
const PRECO_VARAO = {
  "Alumínio|Cromado|19mm": 21.9,
  "Alumínio|Cromado|28mm": 31.7,
  "Alumínio|Cromado|13mm": 23.0,
  "Alumínio|Aço Escovado|19mm": 21.9,
  "Alumínio|Aço Escovado|28mm": 31.7,
  "Alumínio|Aço Escovado|13mm": 23.0,
  "Alumínio|Ouro Velho|19mm": 24.9,
  "Alumínio|Ouro Velho|28mm": 34.9,
  "Alumínio|Ouro Velho|13mm": 23.0,
  "Alumínio|Dourado|19mm": 24.9,
  "Alumínio|Dourado|28mm": 34.9,
  "Alumínio|Dourado|13mm": 23.0,
  "Ferro|Imbuia|19mm": 13.9,
  "Ferro|Imbuia|28mm": 21.9,
  "Ferro|Mogno|19mm": 13.9,
  "Ferro|Mogno|28mm": 21.9,
  "Ferro|Branco|19mm": 13.9,
  "Ferro|Branco|28mm": 21.9,
  "Ferro|Cerejeira|19mm": 13.9,
  "Ferro|Cerejeira|28mm": 21.9,
  "Ferro|Bege|19mm": 13.9,
  "Ferro|Bege|28mm": 21.9,
};
// Suportes do Varão têm catálogo próprio, diferente do catálogo genérico
// usado por Trilho suíço/Tubo Vaza — e dentro do Varão, o catálogo muda
// conforme material (Ferro x Alumínio) e, no Alumínio, conforme o Tipo
// de Suporte escolhido (PVC ou Metal). As linhas "Flange <diâmetro>" de
// cada catálogo são o suporte próprio (uma ponta, um varão) usado pelo
// mecanismo de Flange/Ponteira (ver calcularOrcamentoPeca).
const PRECO_SUPORTE_VARAO_FERRO = {
  "Simples 19mm": 6.9,
  "Simples 28mm": 7.9,
  "Simples 28mm Alongado 10cm": 9.9,
  "Duplo 19/19mm": 8.5,
  "Duplo 19/28mm": 9.9,
  "Triplo 19/19/19mm": 16.9,
  "Triplo 19/19/28mm": 16.9,
  "Flange 19mm": 2.9,
  "Flange 28mm": 3.5,
};
// Confirmado pela loja: essa tabela é mesmo do Varão de Alumínio, só que
// vale apenas pras cores Cromado, Aço Escovado e Ouro Velho — o Dourado
// ainda não tem tabela de Suporte própria informada, então fica "a
// definir" (catalogoSuporte devolve catálogo vazio pra ele, ver abaixo).
const PRECO_SUPORTE_VARAO_ALUMINIO_PVC = {
  "Simples 19mm": 8.9,
  "Simples 28mm": 9.9,
  "Simples 28mm Alongado 10cm": 12.9,
  "Duplo 19/19mm": 9.5,
  "Duplo 19/28mm": 12.9,
  "Triplo 19/19/19mm": 19.9,
  "Triplo 19/19/28mm": null, // "Não tem" — não é oferecido nessa combinação
  "Suporte de Teto 28mm": 7.9,
  "Flange 19mm": 5.5,
  "Flange 28mm": 7.7,
};
// Catálogo de ferragem Metal — só aparece quando o Varão é Alumínio e a
// vendedora escolhe explicitamente Tipo de Suporte = Metal.
const PRECO_SUPORTE_METAL = {
  "Simples 19mm": 15.7,
  "Simples 28mm": 16.7,
  "Simples 13mm": 17.9,
  "Pitão com pé": 10.0,
  "Pitão maciço": 10.0,
  "19mm Alongado 8cm": 19.0,
  "28mm Alongado 10cm": 21.0,
  "Duplo 13/13mm": 21.9,
  "Duplo 19/19mm": 22.0,
  "Duplo 19/28mm": 22.9,
  "Duplo 28/28mm": 24.7,
  "Triplo 19/19/19mm": 29.7,
  "Triplo 19/19/28mm": 31.7,
  "Flange 13mm": 10.0,
  "Flange 19mm": 11.0,
  "Flange 28mm": 12.0,
};
// Cores do Varão de Alumínio que já têm tabela de Suporte PVC
// confirmada — Dourado ainda não tem tabela própria informada.
const CORES_COM_SUPORTE_PVC_ALUMINIO = ["Cromado", "Aço Escovado", "Ouro Velho"];
// Qual catálogo de suporte usar depende do modelo da peça e, no Varão,
// do material + cor + tipo de suporte escolhidos pra peça inteira.
function catalogoSuporte(modelo, orc) {
  if (modelo === "Tubo Vaza") return PRECO_SUPORTE_TUBO_VAZA;
  if (modelo !== "Varão") return PRECO_SUPORTE; // Trilho suíço — inalterado
  const material = orc?.varaoMaterial;
  if (material === "Ferro") return PRECO_SUPORTE_VARAO_FERRO;
  if (material === "Alumínio") {
    if (orc?.varaoTipoSuporte === "Metal") return PRECO_SUPORTE_METAL;
    // Suporte PVC do Alumínio: só Cromado/Aço Escovado/Ouro Velho têm
    // tabela confirmada — Dourado fica "a definir" (catálogo vazio) até
    // a loja informar o preço.
    return CORES_COM_SUPORTE_PVC_ALUMINIO.includes(orc?.varaoCor) ? PRECO_SUPORTE_VARAO_ALUMINIO_PVC : {};
  }
  return {}; // material ainda não escolhido — nada pra escolher
}
// Tubo Vaza sempre precisa de pelo menos 2 suportes (um de cada ponta).
// O Varão trocou essa checagem fixa pela regra de Flange/Ponteira (ver
// suportesInsuficientes em calcularOrcamentoPeca): só exige suporte
// compartilhado quando sobra alguma ponta sem Flange própria.
const SUPORTES_MINIMOS_VARAO = 2; // mantido só como referência/label da UI antiga
const SUPORTES_MINIMOS_TUBO_VAZA = 2;

// Aplica por cima dos valores combinados acima o que foi lido da tabela
// `precos_orcamento` no Supabase (chamado uma vez no boot do app, só na
// versão conectada ao banco — a prévia local continua com os valores
// combinados). Os objetos são mutados no lugar (não recriados), então
// qualquer tela que já leu PRECO_TRILHO etc. no meio do render enxerga o
// valor atualizado automaticamente, sem precisar de um Context/prop novo.
function aplicarPrecosCarregados(mapa) {
  if (!mapa || Object.keys(mapa).length === 0) return;
  const aplicar = (obj, chavePorLabel) => {
    Object.entries(chavePorLabel).forEach(([label, chave]) => {
      if (mapa[chave] != null) obj[label] = mapa[chave];
    });
  };
  aplicar(PRECO_TRILHO, {
    "Trilho simples": "trilho_simples",
    "Trilho simples extra": "trilho_simples_extra",
    "Trilho duplo": "trilho_duplo",
    "Trilho duplo c/ aba": "trilho_duplo_aba",
    "Trilho duplo espaçado": "trilho_duplo_espacado",
    "Trilho triplo": "trilho_triplo",
  });
  aplicar(PRECO_PRESILHA, {
    "Presilha simples": "presilha_simples",
    "Presilha dupla": "presilha_dupla",
    "Presilha de trilho triplo": "presilha_trilho_triplo",
  });
  aplicar(PRECO_COZ, { "Transparente": "coz_transparente", "TNT": "coz_tnt", "Tecido": "coz_tecido" });
  aplicar(PRECO_SUPORTE, { "5x4": "suporte_5x4", "4x6": "suporte_4x6", "5x7": "suporte_5x7" });
  aplicar(PRECO_ILHOS, { "19mm": "ilhos_19mm", "28mm": "ilhos_28mm" });
  if (mapa.deslizante != null) PRECO_UNITARIO.deslizante = mapa.deslizante;
  if (mapa.clip != null) PRECO_UNITARIO.clip = mapa.clip;
  if (mapa.cordao != null) PRECO_UNITARIO.cordaoMetro = mapa.cordao;
  if (mapa.fita_wave != null) PRECO_UNITARIO.fitaWaveMetro = mapa.fita_wave;
  if (mapa.gancho != null) PRECO_UNITARIO.gancho = mapa.gancho;
  // Normaliza um texto (cor, tipo etc.) pro pedaço snake_case da chave do
  // Supabase — minúsculo, sem acento, espaços viram "_". Reaproveitado
  // pelos catálogos de 2 e 3 níveis abaixo (Tubo Vaza, Varão, Argola,
  // Suportes do Varão).
  const chaveTexto = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\//g, "_")
      .replace(/\s+/g, "_");
  // Preços do Tubo Vaza chegam como "tubo_vaza_19mm_cromado" etc.
  TUBO_VAZA_DIAMETROS.forEach((d) => {
    TUBO_VAZA_CORES.forEach((c) => {
      const chaveSupabase = "tubo_vaza_" + chaveTexto(d) + "_" + chaveTexto(c);
      if (mapa[chaveSupabase] != null) PRECO_TUBO_VAZA[d + "|" + c] = mapa[chaveSupabase];
    });
  });
  // Preços do Varão (haste) chegam como "varao_aluminio_cromado_19mm" etc.
  // — cada material só combina com sua própria lista de cores/diâmetros.
  VARAO_MATERIAIS.forEach((m) => {
    coresVaraoDisponiveis(m).forEach((c) => {
      diametrosVaraoDisponiveis(m).forEach((d) => {
        const chaveSupabase = "varao_" + chaveTexto(m) + "_" + chaveTexto(c) + "_" + chaveTexto(d);
        if (mapa[chaveSupabase] != null) PRECO_VARAO[m + "|" + c + "|" + d] = mapa[chaveSupabase];
      });
    });
  });
  // Preços de Argola chegam como "argola_aluminio_metal_19mm",
  // "argola_ferro_pvc_28mm" etc.
  Object.keys(PRECO_ARGOLA).forEach((chaveInterna) => {
    const [m, tipoArgola, d] = chaveInterna.split("|");
    const chaveSupabase = "argola_" + chaveTexto(m) + "_" + chaveTexto(tipoArgola) + "_" + chaveTexto(d);
    if (mapa[chaveSupabase] != null) PRECO_ARGOLA[chaveInterna] = mapa[chaveSupabase];
  });
  // Suportes do Varão: três catálogos separados (Ferro, Alumínio PVC,
  // Metal), cada um com sua própria lista de rótulos internos — a chave
  // Supabase é o rótulo interno normalizado, prefixado pelo catálogo.
  const aplicarSuporteVarao = (obj, prefixo) => {
    Object.keys(obj).forEach((rotulo) => {
      const chaveSupabase = prefixo + "_" + chaveTexto(rotulo);
      if (mapa[chaveSupabase] != null) obj[rotulo] = mapa[chaveSupabase];
    });
  };
  aplicarSuporteVarao(PRECO_SUPORTE_VARAO_FERRO, "suporte_varao_ferro");
  aplicarSuporteVarao(PRECO_SUPORTE_VARAO_ALUMINIO_PVC, "suporte_varao_alum_pvc");
  aplicarSuporteVarao(PRECO_SUPORTE_METAL, "suporte_metal");
  aplicarSuporteVarao(PRECO_SUPORTE_TUBO_VAZA, "suporte_tubo_vaza");
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Trilho suíço: tamanho REAL = largura da cortina, sem sobra nas pontas. A
// cobrança comercial arredonda pra cima de 0,50 em 0,50m — exceto quando a
// largura REAL já atinge/ultrapassa 5,00m, caso em que se cobra a barra
// inteira de 6,00m (a loja nunca corta/cobra só 5,00m de uma barra). Essa
// regra de barra é específica do trilho suíço — o Tubo Vaza ainda não tem
// regra de arredondamento definida, então mostra a largura real mesmo.
function calcularTrilhoCobrado(larguraReal) {
  if (larguraReal == null) return null;
  if (larguraReal >= 5) return 6;
  const passos = Math.ceil(larguraReal / 0.5 - 1e-9);
  return round2(passos * 0.5);
}

// Presilhas: primeira a 10cm de cada ponta, depois uma a cada 40cm —
// sempre na largura REAL, nunca a comercial arredondada do trilho. Vale
// pra todos os tipos de trilho suíço agora (não só o simples).
function calcularPresilhasSimples(larguraReal) {
  if (larguraReal == null) return null;
  const cm = larguraReal * 100;
  if (cm < 20) return 0;
  return Math.floor((cm - 20) / 40 + 1e-9) + 1;
}

// Deslizantes/clips/cordão do Wave: a cortina se divide em N folhas
// iguais — N é a Abertura escolhida pra peça (Inteira=1, Aberta ao
// Meio=2, 4 Aberturas=3, 5 Aberturas=4, ver ABERTURAS_CORTINA) — e o
// cálculo é feito por folha, depois somado (porFolha * folhas). Também
// usada pelo acabamento Franzido (sempre com o espaçamento de 5cm), mas
// nesse caso só a quantidade de deslizante é aproveitada — sem
// cordão/clips. Sem Abertura escolhida (folhas null), fica "a definir".
function calcularWave(larguraReal, espacamento, folhas) {
  if (larguraReal == null || !espacamento || !folhas) return null;
  const folha = larguraReal / folhas;
  let porFolha;
  let passo;
  if (espacamento === "Wave 5cm") {
    porFolha = Math.round(folha * 20) + 2;
    passo = 0.05;
  } else if (espacamento === "Wave 6,5cm") {
    const base = folha / 0.065;
    // arredonda pra cima pro próximo número PAR, só depois soma a sobra
    const ajustado = Math.ceil(base / 2 - 1e-9) * 2;
    porFolha = ajustado + 2;
    passo = 0.065;
  } else {
    return null;
  }
  const deslizantes = porFolha * folhas;
  return { deslizantes, clips: deslizantes, cordaoMetros: round2(deslizantes * passo) };
}

// Ilhós/Argola do Varão, calculado POR FOLHA: 2 na ponta externa (uma
// dupla, bem juntas) + 1 a cada 10cm, terminando com a última pelo menos
// 5cm antes do final da folha (nunca passar desse ponto). Mesma regra de
// espaçamento vale pra Ilhós e Argola — o que muda é só se soma Gancho
// (Argola) ou não (Ilhós).
function calcularIlhosArgolasPorFolha(larguraFolha) {
  const cm = larguraFolha * 100;
  const alvo = cm - 5; // posição-limite da última (nunca passar disso)
  if (alvo < 10) return 2; // folha mínima: só cabem as 2 da ponta
  const extras = Math.floor((alvo - 10) / 10 + 1e-9) + 1;
  return 2 + extras;
}
// Igual ao Wave: a largura real se divide em N folhas iguais (N =
// Abertura escolhida pra peça, ver ABERTURAS_CORTINA) e a fórmula acima
// é aplicada em cada folha, depois somada (porFolha * folhas). Sem
// Abertura escolhida (folhas null), fica "a definir".
function calcularIlhosArgolas(larguraReal, folhas) {
  if (larguraReal == null || !folhas) return null;
  const larguraFolha = larguraReal / folhas;
  return calcularIlhosArgolasPorFolha(larguraFolha) * folhas;
}

function camadaOrcamentoPadrao() {
  return {
    ativo: false,
    tecido: "",
    precoTecido: null,
    qtdTecido: null,
    cozTipo: "Sem COZ",
    qtdCoz: null,
    acabamento: null, // "Wave" | "Franzido" — cada camada tem o seu próprio
    espacamentoCordao: null, // "Wave 5cm" | "Wave 6,5cm" — só quando acabamento === "Wave"
    // Fita fácil: no Wave é automática, na MESMA metragem do COZ TNT/Tecido
    // dessa camada (qtdCoz) — não é digitada à parte. No Franzido é
    // OPCIONAL — controlada por adicionarFitaFacil, abaixo.
    alturaBarra: null, // cm — tamanho da barra dessa camada, informado na etapa de orçamento
    adicionarFitaFacil: false, // só usado quando acabamento === "Franzido" — pré-selecionado sem fita
    // Só usados quando Modelo = "Varão" — substituem acabamento/espacamentoCordao
    // pra essa camada (Varão não usa Wave/Franzido, deslizante, clip, fita
    // fácil nem COZ Transparente).
    varaoDiametro: null, // "19mm" | "28mm" | "13mm" (13mm só existe no Alumínio)
    varaoFixacao: null, // "Ilhós" | "Argola"
    // Tipo de Argola — só relevante quando orc.varaoMaterial === "Alumínio"
    // E a fixação efetiva dessa camada é "Argola" (no Ferro só existe PVC,
    // não precisa escolher). Ver TIPOS_ARGOLA_ALUMINIO.
    argolaTipo: null, // "Metal" | "PVC" | "PVC Frisada"
    // Flange/Ponteira (só Varão): cada ponta (esquerda/direita) desse
    // varão OU usa Flange própria OU depende do Suporte compartilhado da
    // peça — quando não tem Flange, essa ponta soma 1 Ponteira do
    // diâmetro dessa camada. Ver calcularOrcamentoPeca.
    flangeEsquerda: false,
    flangeDireita: false,
    // Só usado quando Modelo = "Tubo Vaza" — cada camada escolhe seu
    // próprio diâmetro, exatamente como acontece com o Varão. A cor
    // continua sendo uma escolha só, pra peça inteira (orc.tuboVazaCor).
    tuboVazaDiametro: null, // "19mm" | "28mm"
  };
}
function orcamentoPadrao() {
  return {
    // Abertura (Inteira/Aberta ao Meio/4 Aberturas/5 Aberturas) — uma
    // escolha só pra peça inteira, um de ABERTURAS_CORTINA (chave). Sem
    // ela escolhida, Deslizante/Clip/Cordão/Ilhós/Argola/Gancho ficam "a
    // definir" (ver folhasDaAbertura em calcularOrcamentoPeca).
    abertura: null,
    tipoTrilho: null, // um de TIPOS_TRILHO_SUICO — só quando Modelo = "Trilho suíço"
    trilhoCor: null, // uma de TRILHO_CORES ("Branco" | "Preto") — só quando Modelo = "Trilho suíço"
    tuboVazaCor: null, // uma de TUBO_VAZA_CORES — só quando Modelo = "Tubo Vaza"
    varaoMaterial: null, // um de VARAO_MATERIAIS ("Alumínio" | "Ferro") — só quando Modelo = "Varão"
    varaoCor: null, // uma cor de coresVaraoDisponiveis(varaoMaterial) — só quando Modelo = "Varão"
    // Tipo de Suporte do Varão — só relevante quando varaoMaterial ===
    // "Alumínio" (no Ferro não tem escolha, é sempre o catálogo Ferro).
    varaoTipoSuporte: null, // "PVC" | "Metal"
    // Preço manual da Ponteira, por diâmetro — não vem de catálogo (a
    // loja não informou tabela), a vendedora digita. Só os diâmetros com
    // ponteira em uso (qtd > 0) aparecem na ficha.
    precoPonteiraPorDiametro: { "13mm": null, "19mm": null, "28mm": null },
    camadas: { fundo: camadaOrcamentoPadrao(), forro: camadaOrcamentoPadrao(), xale: camadaOrcamentoPadrao() },
    // Caso específico do trilho simples (só cabe uma cortina no canal):
    // o Fundo é costurado junto no Forro e vira uma peça física só, então
    // segue o acabamento do Forro e não soma deslizante/clip/cordão/fita
    // próprios. Campo mora aqui (nível da peça) mas o checkbox só aparece
    // na camada Forro.
    fundoCosturadoJunto: false,
    observacaoCostura: "", // nota livre pra outros casos não cobertos acima
    suportes: [], // [{ id, tipo, qtd }]
    // Mão de obra: valores digitados pela vendedora, não calculados.
    // Instalação pode ficar zerada (cliente que não quer instalação) —
    // Fabricação é sempre exibida no Resumo, mesmo zerada.
    maoDeObra: { fabricacao: null, instalacao: null },
  };
}

// Calcula deslizante/clip/cordão/fita fácil de UMA camada, segundo o
// acabamento dela própria (Wave ou Franzido). Reaproveitada pra cada
// camada ativa que não esteja "mesclada" (costurada junto em outra).
function calcularMaterialCamada(larguraReal, camada, folhas) {
  let deslizantes = null;
  let clips = null;
  let cordao = null;
  let fitaWave = null;
  if (camada.acabamento === "Wave") {
    const wave = calcularWave(larguraReal, camada.espacamentoCordao, folhas);
    if (wave) {
      deslizantes = {
        quantidade: wave.deslizantes,
        valorUnitario: PRECO_UNITARIO.deslizante,
        total: round2(wave.deslizantes * PRECO_UNITARIO.deslizante),
      };
      clips = { quantidade: wave.clips, valorUnitario: PRECO_UNITARIO.clip, total: round2(wave.clips * PRECO_UNITARIO.clip) };
      cordao = {
        metros: wave.cordaoMetros,
        valorUnitario: PRECO_UNITARIO.cordaoMetro,
        total: round2(wave.cordaoMetros * PRECO_UNITARIO.cordaoMetro),
      };
    }
    // COZ Transparente vem sozinho; COZ TNT e COZ Tecido sempre acompanham
    // fita fácil no orçamento, na MESMA metragem do COZ (é a mesma peça de
    // tecido por onde a fita passa) — não é digitado à parte.
    if (camada.cozTipo === "TNT" || camada.cozTipo === "Tecido") {
      const metros = camada.qtdCoz || 0;
      fitaWave = { metros, valorUnitario: PRECO_UNITARIO.fitaWaveMetro, total: round2(metros * PRECO_UNITARIO.fitaWaveMetro) };
    }
  } else if (camada.acabamento === "Franzido") {
    // Mesma contagem de deslizante do Wave 5cm; sem cordão nem clips — o
    // deslizante do franzido é costurado direto na cortina. Franzido não
    // usa Transparente (só TNT ou Tecido) e a fita fácil aqui é OPCIONAL,
    // marcada à parte pela vendedora (adicionarFitaFacil) — vem
    // pré-selecionada como "não adicionar".
    const wave = calcularWave(larguraReal, "Wave 5cm", folhas);
    if (wave) {
      deslizantes = {
        quantidade: wave.deslizantes,
        valorUnitario: PRECO_UNITARIO.deslizante,
        total: round2(wave.deslizantes * PRECO_UNITARIO.deslizante),
      };
    }
    if (camada.adicionarFitaFacil && (camada.cozTipo === "TNT" || camada.cozTipo === "Tecido")) {
      const metros = camada.qtdCoz || 0;
      fitaWave = { metros, valorUnitario: PRECO_UNITARIO.fitaWaveMetro, total: round2(metros * PRECO_UNITARIO.fitaWaveMetro) };
    }
  }
  return { deslizantes, clips, cordao, fitaWave };
}

// Função pura: pega a peça (largura, modelo, orçamento configurado) e
// devolve todo o detalhamento de materiais + o resumo com o custo total.
// Só calcula os modelos em MODELOS_COM_ORCAMENTO — os demais (Varão,
// Trilho curvo, Trilho com comando, Motorizado) e Persiana não estão
// cobertos ainda, e usaOrcamento vem false pra a ficha saber disso.
function calcularOrcamentoPeca(peca) {
  const orc = peca.orcamento || orcamentoPadrao();
  const larguraReal = peca.largura;
  const modelo = peca.produto === "Cortina" ? peca.modelo : null;
  const usaOrcamento = MODELOS_COM_ORCAMENTO.includes(modelo);

  if (!usaOrcamento) {
    return { usaOrcamento: false };
  }

  // Fundo só é considerado "costurado junto" se o Forro também estiver
  // ativo — sem Forro ativo, não há em quem o Fundo "seguir".
  const forroAtivo = !!orc.camadas?.forro?.ativo;
  const fundoMesclado = !!orc.fundoCosturadoJunto && forroAtivo;

  // Só a camada mais à frente (entre as que têm acabamento próprio, ou
  // seja, ativas e não mescladas) pode ser Wave. Se ela for Wave, as
  // demais camadas ativas com acabamento próprio são obrigatoriamente
  // Franzido, mesmo que a pessoa tenha marcado Wave nelas.
  const camadasComAcabamentoProprio = ORDEM_FRENTE_CAMADAS.filter((chave) => {
    const ativa = !!orc.camadas?.[chave]?.ativo;
    const mesclada = chave === "fundo" && fundoMesclado;
    return ativa && !mesclada;
  });
  const camadaFrontal = camadasComAcabamentoProprio[0] || null;
  const frontalEhWave = !!camadaFrontal && orc.camadas[camadaFrontal]?.acabamento === "Wave";

  const ehVarao = modelo === "Varão";
  const ehTuboVaza = modelo === "Tubo Vaza";
  // Varão: mesma lógica do Wave/Franzido, mas com Ilhós/Argola — só a
  // camada mais à frente pode ser Ilhós. Se ela for Ilhós, as demais
  // camadas ativas (não mescladas) são obrigatoriamente Argola.
  const frontalEhIlhos = ehVarao && !!camadaFrontal && orc.camadas[camadaFrontal]?.varaoFixacao === "Ilhós";

  // Catálogo de suporte da peça (varia com modelo e, no Varão, com
  // material + tipo de suporte) — calculado uma vez só, reaproveitado
  // pelas Flanges de cada camada (abaixo) e pelos Suportes compartilhados
  // (depois do loop).
  const catalogoSup = catalogoSuporte(modelo, orc);
  // Camadas ativas/não-mescladas, ordenadas de trás pra frente (Fundo
  // primeiro) — usada só pelo Varão pra saber, quando o Suporte da peça
  // é Duplo/Triplo, qual diâmetro cai em qual camada (ver
  // diametroVaraoInfo).
  const camadasVaraoBackToFront = [...camadasComAcabamentoProprio].reverse();
  // Abertura da peça — quantas folhas a largura real se divide (ver
  // ABERTURAS_CORTINA). Sem Abertura escolhida, folhas fica null e os
  // cálculos "por folha" (Deslizante/Clip/Cordão do Wave/Franzido,
  // Ilhós/Argola/Gancho do Varão) ficam "a definir".
  const folhas = folhasDaAbertura(orc.abertura);

  const camadas = {};
  let totalTecido = 0;
  let totalCoz = 0;
  let totalDeslizantesValor = 0;
  let totalClipsValor = 0;
  let totalCordaoValor = 0;
  let totalFitaValor = 0;
  let totalIlhosArgolasValor = 0;
  let totalGanchosValor = 0;
  let totalVaraoValor = 0;
  let totalTuboVazaValor = 0;
  let totalFlangeValor = 0;
  // Contagem de Ponteira por diâmetro, somada em todas as camadas ativas
  // não mescladas — cada ponta sem Flange própria soma 1 Ponteira do
  // diâmetro daquela camada (ver comentário de calcularOrcamentoPeca).
  const ponteirasPorDiametro = {};
  CAMADAS_CORTINA.forEach((chave) => {
    let c = orc.camadas?.[chave] || camadaOrcamentoPadrao();
    const mesclada = chave === "fundo" && fundoMesclado;
    // Fundo costurado junto no Forro não leva COZ próprio.
    const custoTecido = c.ativo ? round2((c.qtdTecido || 0) * (c.precoTecido || 0)) : 0;
    const precoCoz = c.cozTipo && c.cozTipo !== "Sem COZ" ? PRECO_COZ[c.cozTipo] || 0 : 0;
    const custoCoz = c.ativo && !mesclada ? round2((c.qtdCoz || 0) * precoCoz) : 0;

    let mat = { deslizantes: null, clips: null, cordao: null, fitaWave: null };
    let ilhosOuArgolas = null;
    let ganchos = null;
    let varaoBarra = null;
    let tuboVazaBarra = null;
    let flange = null;
    let forcarFranzido = false;
    let forcarArgola = false;

    if (ehVarao) {
      // Se o Suporte da peça for Duplo/Triplo, o diâmetro desta camada é
      // automático (ver diametroVaraoInfo) — sobrescreve o que estiver
      // salvo manualmente em c.varaoDiametro. Com Suporte Simples (ou
      // nenhum Suporte ainda), continua manual.
      const diametroInfo = diametroVaraoInfo(orc, camadasVaraoBackToFront, chave, c.varaoDiametro);
      c = { ...c, varaoDiametro: diametroInfo.valor, varaoDiametroAutomatico: diametroInfo.automatico };
      // Varão: sem deslizante/clip/cordão/fita fácil — em vez disso,
      // quantidade de Ilhós ou Argola calculada da largura real, e Gancho
      // (mesma quantidade da Argola) só quando a fixação é Argola. Só a
      // camada mais à frente pode ser Ilhós; se for, as de trás viram
      // Argola automaticamente (mesma regra do Wave/Franzido).
      forcarArgola = frontalEhIlhos && camadaFrontal !== chave && camadasComAcabamentoProprio.includes(chave);
      const fixacaoEfetiva = forcarArgola ? "Argola" : c.varaoFixacao;
      if (c.ativo && !mesclada && larguraReal && fixacaoEfetiva && folhas) {
        const quantidade = calcularIlhosArgolas(larguraReal, folhas);
        let valorUnitario = null;
        let argolaTipoEfetivo = null;
        if (fixacaoEfetiva === "Argola") {
          // No Ferro só existe a opção PVC — não precisa escolher. No
          // Alumínio, usa o que a vendedora escolheu nessa camada.
          argolaTipoEfetivo = orc.varaoMaterial === "Ferro" ? "PVC" : c.argolaTipo || null;
          valorUnitario =
            orc.varaoMaterial && argolaTipoEfetivo && c.varaoDiametro
              ? PRECO_ARGOLA[orc.varaoMaterial + "|" + argolaTipoEfetivo + "|" + c.varaoDiametro] ?? null
              : null;
        } else {
          valorUnitario = c.varaoDiametro ? PRECO_ILHOS[c.varaoDiametro] ?? null : null;
        }
        ilhosOuArgolas = {
          tipo: fixacaoEfetiva,
          argolaTipo: fixacaoEfetiva === "Argola" ? argolaTipoEfetivo : null,
          quantidade,
          valorUnitario,
          precoDefinido: valorUnitario != null,
          total: valorUnitario != null ? round2(quantidade * valorUnitario) : 0,
        };
        if (fixacaoEfetiva === "Argola") {
          const valorGancho = PRECO_UNITARIO.gancho;
          ganchos = {
            quantidade,
            valorUnitario: valorGancho,
            precoDefinido: valorGancho != null,
            total: valorGancho != null ? round2(quantidade * valorGancho) : 0,
          };
        }
      }
      // O Varão em si: 1 por camada ativa, cobrado igual ao Trilho suíço
      // (arredonda de 0,50 em 0,50m na largura real, barra inteira de
      // 6,00m quando a largura real já atinge 5,00m). Preço varia por
      // material + cor + diâmetro (material e cor são escolhidos uma vez
      // pra peça toda).
      if (c.ativo && !mesclada && larguraReal && c.varaoDiametro && orc.varaoMaterial && orc.varaoCor) {
        const larguraCobrada = calcularTrilhoCobrado(larguraReal);
        const valorUnitario = PRECO_VARAO[orc.varaoMaterial + "|" + orc.varaoCor + "|" + c.varaoDiametro] ?? null;
        varaoBarra = {
          material: orc.varaoMaterial,
          diametro: c.varaoDiametro,
          cor: orc.varaoCor,
          larguraReal,
          larguraCobrada,
          valorUnitario,
          precoDefinido: valorUnitario != null,
          total: valorUnitario != null ? round2(larguraCobrada * valorUnitario) : 0,
        };
      }
      // Flange/Ponteira: cada ponta (esquerda/direita) desse varão OU tem
      // Flange própria (soma no custo da camada, sem Ponteira nessa
      // ponta) OU depende do Suporte compartilhado da peça (sem Flange,
      // soma 1 Ponteira do diâmetro dessa camada). Flange não é
      // compartilhável entre camadas/varões — é sempre por (camada,
      // ponta).
      if (c.ativo && !mesclada) {
        const qtdFlangesNestaCamada = (c.flangeEsquerda ? 1 : 0) + (c.flangeDireita ? 1 : 0);
        if (qtdFlangesNestaCamada > 0) {
          const precoFlange = c.varaoDiametro ? catalogoSup["Flange " + c.varaoDiametro] ?? null : null;
          flange = {
            quantidade: qtdFlangesNestaCamada,
            valorUnitario: precoFlange,
            precoDefinido: precoFlange != null,
            total: precoFlange != null ? round2(qtdFlangesNestaCamada * precoFlange) : 0,
          };
        }
        if (c.varaoDiametro) {
          const ponteirasNestaCamadaPorPonta = (c.flangeEsquerda ? 0 : 1) + (c.flangeDireita ? 0 : 1);
          if (ponteirasNestaCamadaPorPonta > 0) {
            ponteirasPorDiametro[c.varaoDiametro] = (ponteirasPorDiametro[c.varaoDiametro] || 0) + ponteirasNestaCamadaPorPonta;
          }
        }
      }
    } else {
      forcarFranzido = frontalEhWave && camadaFrontal !== chave && camadasComAcabamentoProprio.includes(chave);
      const acabamentoEfetivo = forcarFranzido ? "Franzido" : c.acabamento;
      mat =
        c.ativo && !mesclada && larguraReal
          ? calcularMaterialCamada(larguraReal, { ...c, acabamento: acabamentoEfetivo }, folhas)
          : { deslizantes: null, clips: null, cordao: null, fitaWave: null };
      // Tubo Vaza: cada camada escolhe seu próprio diâmetro (igual ao
      // Varão) — a cor continua única pra peça toda. Cobrança pela mesma
      // regra de arredondamento de meio metro do Trilho suíço/Varão.
      if (ehTuboVaza && c.ativo && !mesclada && larguraReal && c.tuboVazaDiametro && orc.tuboVazaCor) {
        const larguraCobrada = calcularTrilhoCobrado(larguraReal);
        const valorUnitario = PRECO_TUBO_VAZA[c.tuboVazaDiametro + "|" + orc.tuboVazaCor] ?? null;
        tuboVazaBarra = {
          diametro: c.tuboVazaDiametro,
          cor: orc.tuboVazaCor,
          larguraReal,
          larguraCobrada,
          valorUnitario,
          precoDefinido: valorUnitario != null,
          total: valorUnitario != null ? round2(larguraCobrada * valorUnitario) : 0,
        };
      }
    }

    const custoMateriais = round2(
      (mat.deslizantes?.total || 0) +
        (mat.clips?.total || 0) +
        (mat.cordao?.total || 0) +
        (mat.fitaWave?.total || 0) +
        (ilhosOuArgolas?.total || 0) +
        (ganchos?.total || 0) +
        (varaoBarra?.total || 0) +
        (tuboVazaBarra?.total || 0) +
        (flange?.total || 0)
    );
    camadas[chave] = {
      ...c,
      custoTecido,
      custoCoz,
      mesclada,
      forcarFranzido,
      forcarArgola,
      ...mat,
      ilhosOuArgolas,
      ganchos,
      varaoBarra,
      tuboVazaBarra,
      flange,
      custoTotal: round2(custoTecido + custoCoz + custoMateriais),
    };
    totalTecido += custoTecido;
    totalCoz += custoCoz;
    totalDeslizantesValor += mat.deslizantes?.total || 0;
    totalClipsValor += mat.clips?.total || 0;
    totalCordaoValor += mat.cordao?.total || 0;
    totalFitaValor += mat.fitaWave?.total || 0;
    totalIlhosArgolasValor += ilhosOuArgolas?.total || 0;
    totalGanchosValor += ganchos?.total || 0;
    totalVaraoValor += varaoBarra?.total || 0;
    totalTuboVazaValor += tuboVazaBarra?.total || 0;
    totalFlangeValor += flange?.total || 0;
  });

  // Ponteira: preço é digitado manualmente pela vendedora (não tem
  // catálogo), por diâmetro — soma só os diâmetros que de fato têm
  // Ponteira em uso (ponta sem Flange própria).
  const precoPonteiraPorDiametro = orc.precoPonteiraPorDiametro || {};
  const precoPonteiraUsado = {};
  let totalPonteiraValor = 0;
  let ponteiraIncompleta = false;
  Object.keys(ponteirasPorDiametro).forEach((d) => {
    const qtd = ponteirasPorDiametro[d] || 0;
    const preco = precoPonteiraPorDiametro[d] ?? null;
    precoPonteiraUsado[d] = preco;
    if (preco != null) {
      totalPonteiraValor += qtd * preco;
    } else if (qtd > 0) {
      ponteiraIncompleta = true;
    }
  });
  totalPonteiraValor = round2(totalPonteiraValor);

  let trilho = null;
  let presilhas = null;
  if (modelo === "Trilho suíço") {
    const tipoTrilho = orc.tipoTrilho;
    if (tipoTrilho && PRECO_TRILHO[tipoTrilho] != null && larguraReal) {
      const larguraCobrada = calcularTrilhoCobrado(larguraReal);
      const valorUnitario = PRECO_TRILHO[tipoTrilho];
      trilho = { tipo: tipoTrilho, larguraReal, larguraCobrada, valorUnitario, total: round2(larguraCobrada * valorUnitario) };
    }
    if (tipoTrilho && TRILHO_PARA_PRESILHA[tipoTrilho]) {
      const tipoPresilha = TRILHO_PARA_PRESILHA[tipoTrilho];
      const quantidade = calcularPresilhasSimples(larguraReal);
      const valorUnitario = PRECO_PRESILHA[tipoPresilha];
      presilhas = { tipo: tipoPresilha, quantidade, valorUnitario, total: quantidade != null ? round2(quantidade * valorUnitario) : 0 };
    }
    // Presilha é peça específica do canal do trilho suíço — o Tubo Vaza
    // (tubo redondo) e o Varão não entram nessa regra, então não aparece
    // nenhuma pra eles.
  }

  const suportes = (orc.suportes || []).map((s) => {
    const valorUnitario = catalogoSup[s.tipo];
    return {
      ...s,
      valorUnitario: valorUnitario || 0,
      precoDefinido: valorUnitario != null,
      total: round2((s.qtd || 0) * (valorUnitario || 0)),
    };
  });
  const totalSuportes = round2(suportes.reduce((soma, s) => soma + s.total, 0));

  // Mão de obra: valores digitados pela vendedora (Fabricação e
  // Instalação), não calculados a partir de fórmula nenhuma.
  const maoDeObra = {
    fabricacao: orc.maoDeObra?.fabricacao || 0,
    instalacao: orc.maoDeObra?.instalacao || 0,
  };
  const totalMaoDeObra = round2(maoDeObra.fabricacao + maoDeObra.instalacao);

  const totalGeral = round2(
    totalTecido +
      totalCoz +
      (trilho?.total || 0) +
      (presilhas?.total || 0) +
      totalDeslizantesValor +
      totalClipsValor +
      totalCordaoValor +
      totalFitaValor +
      totalIlhosArgolasValor +
      totalGanchosValor +
      totalVaraoValor +
      totalTuboVazaValor +
      totalFlangeValor +
      totalPonteiraValor +
      totalSuportes +
      totalMaoDeObra
  );

  // Tubo Vaza sempre precisa de pelo menos 2 suportes (soma das
  // quantidades, não só de linhas adicionadas) — regra inalterada.
  const totalQtdSuportes = suportes.reduce((soma, s) => soma + (s.qtd || 0), 0);
  // Varão: não é mais uma contagem mínima fixa de suportes — cada varão
  // (camada ativa não mesclada) só PRECISA de um suporte compartilhado
  // quando sobra pelo menos uma ponta sem Flange própria. Se toda camada
  // ativa tem Flange nas duas pontas, nenhum suporte compartilhado é
  // exigido.
  const varaoPrecisaSuporteCompartilhado =
    ehVarao &&
    CAMADAS_CORTINA.some((chave) => {
      const cc = camadas[chave];
      return cc.ativo && !cc.mesclada && (!cc.flangeEsquerda || !cc.flangeDireita);
    });
  const suportesInsuficientes =
    (varaoPrecisaSuporteCompartilhado && totalQtdSuportes === 0) ||
    (ehTuboVaza && totalQtdSuportes < SUPORTES_MINIMOS_TUBO_VAZA);

  // Varão/Tubo Vaza: preço de Ilhós/Argola/Gancho/Varão/Tubo/Flange (por
  // camada ativa), Ponteira (por diâmetro) ou de algum suporte adicionado
  // ainda não cadastrado — total incompleto, avisa em vez de fingir que é
  // o custo real.
  const suportesIncompletos = (ehVarao || ehTuboVaza) && suportes.some((s) => !s.precoDefinido);
  const acessoriosVaraoIncompletos =
    ehVarao &&
    (CAMADAS_CORTINA.some((chave) => {
      const cc = camadas[chave];
      return (
        cc.ativo &&
        !cc.mesclada &&
        ((cc.ilhosOuArgolas && !cc.ilhosOuArgolas.precoDefinido) ||
          (cc.ganchos && !cc.ganchos.precoDefinido) ||
          (cc.varaoBarra && !cc.varaoBarra.precoDefinido) ||
          (cc.flange && !cc.flange.precoDefinido))
      );
    }) ||
      ponteiraIncompleta);
  // Tubo Vaza: mesma lógica acima, mas olhando cc.tuboVazaBarra.
  const acessoriosTuboVazaIncompletos =
    ehTuboVaza &&
    CAMADAS_CORTINA.some((chave) => {
      const cc = camadas[chave];
      return cc.ativo && !cc.mesclada && cc.tuboVazaBarra && !cc.tuboVazaBarra.precoDefinido;
    });
  // Sem Abertura escolhida, os cálculos "por folha" (Deslizante/Clip/
  // Cordão do Wave/Franzido, Ilhós/Argola/Gancho do Varão) ficam "a
  // definir" — só avisa quando existe alguma camada ativa que dependeria
  // disso (senão a peça ainda nem tem camada configurada).
  const aberturaIncompleta = camadasComAcabamentoProprio.length > 0 && !folhas;

  return {
    usaOrcamento: true,
    abertura: orc.abertura,
    folhas,
    camadas,
    trilho,
    presilhas,
    suportes,
    maoDeObra: { ...maoDeObra, total: totalMaoDeObra },
    // Ponteira não é uma camada nem um suporte — é um item peça-a-peça
    // que soma pelas pontas sem Flange de todas as camadas ativas. Preço
    // é digitado manualmente por diâmetro (orc.precoPonteiraPorDiametro).
    ponteiras: {
      porDiametro: ponteirasPorDiametro,
      precoPorDiametro: precoPonteiraUsado,
      total: totalPonteiraValor,
    },
    resumo: {
      tecido: round2(totalTecido),
      coz: round2(totalCoz),
      trilho: trilho?.total || 0,
      presilhas: presilhas?.total || 0,
      deslizantes: round2(totalDeslizantesValor),
      clips: round2(totalClipsValor),
      cordao: round2(totalCordaoValor),
      fitaWave: round2(totalFitaValor),
      ilhosArgolas: round2(totalIlhosArgolasValor),
      ganchos: round2(totalGanchosValor),
      varao: round2(totalVaraoValor),
      tuboVaza: round2(totalTuboVazaValor),
      flange: round2(totalFlangeValor),
      ponteira: totalPonteiraValor,
      suportes: totalSuportes,
      maoDeObra: totalMaoDeObra,
      total: totalGeral,
      suportesInsuficientes,
      // Varão/Tubo Vaza com ilhós/argola/gancho/varão/tubo/suporte sem
      // preço cadastrado, ou Abertura ainda não escolhida: avisa que o
      // total está incompleto em vez de fingir que é o custo real.
      incompleto: suportesIncompletos || acessoriosVaraoIncompletos || acessoriosTuboVazaIncompletos || aberturaIncompleta,
      aberturaIncompleta,
    },
  };
}
function canEditarOrcamento(papel) {
  return canVerValores(papel);
}
function canVerMateriaisProducao(papel) {
  return papel === "Fábrica" || canVerValores(papel);
}

// Rótulo do Modelo exatamente como a fábrica precisa ver — combina o
// modelo da peça (Trilho Suíço / Tubo Vaza) com o acabamento da camada
// (Wave/Franzido) e, no Tubo Vaza, o diâmetro escolhido nessa camada,
// porque o desconto de medida usado no corte é diferente pra cada
// combinação.
function labelModeloCamada(modeloPeca, acabamentoEfetivo, diametro) {
  if (!modeloPeca || !acabamentoEfetivo) return null;
  if (modeloPeca === "Trilho suíço") return `Trilho Suíço ${acabamentoEfetivo}`;
  if (modeloPeca === "Tubo Vaza") return `Tubo Vaza ${diametro ? diametro + " " : ""}${acabamentoEfetivo}`;
  return null;
}
// Rótulo do Modelo pra camadas de Varão — combina a fixação (Ilhós ou
// Argola) com o diâmetro escolhido nessa camada.
function labelModeloVarao(fixacao, diametro) {
  if (!fixacao) return null;
  return `Varão ${fixacao}${diametro ? ` ${diametro}` : ""}`;
}
// Rótulo do tipo de COZ como aparece na ficha de produção.
// comFitaFacil: no Wave, TNT/Tecido sempre vêm com fita fácil (automático);
// no Franzido, a fita é opcional — passe se ela foi de fato adicionada
// (normalmente calc.camadas[chave].fitaWave truthy) pra refletir na ficha.
function labelTipoCoz(cozTipo, comFitaFacil) {
  if (cozTipo === "Transparente") return "Transparente";
  if (cozTipo === "TNT") return comFitaFacil ? "TNT + Fita Fácil" : "TNT";
  if (cozTipo === "Tecido") return comFitaFacil ? "COZ Tecido + Fita Fácil" : "COZ Tecido";
  return null;
}

/* Perfis de acesso. Vêm de um usuário autenticado de verdade (Supabase
   Auth + tabela `perfis`), não mais autodeclarados na entrada do app. */
const PAPEIS = ["Gestor Master", "Gestor", "Vendedor", "Fábrica", "Instalador"];

/* Status do pedido (etapa comercial/agenda). Não é mais um campo livre:
   é derivado automaticamente dos dados (medição salva, valor preenchido,
   evento de agenda, peça em produção/disponível/instalada). A única
   escolha manual é marcar/desmarcar "Orçamento Perdido" — o resto o
   sistema descobre sozinho. */
const STATUS_PEDIDO = [
  "Agendar Medição",
  "Medida Agendada",
  "Medida Feita",
  "Orçamento em Andamento",
  "Orçamento Passado",
  "Venda Feita",
  "Em produção",
  "Parcialmente Fabricado",
  "Disponível para instalar",
  "Instalado",
  "Orçamento Perdido",
];
function statusPedidoColor(status) {
  return (
    {
      // Sem nenhuma medição ainda (nem agendada, nem feita): tag amarela.
      "Agendar Medição": "var(--amber)",
      "Medida Agendada": "var(--amber)",
      "Medida Feita": "var(--success)",
      "Orçamento em Andamento": "#7C93C9",
      "Orçamento Passado": "#6B3FA0",
      "Venda Feita": "var(--rose)",
      "Em produção": "var(--accent)",
      "Parcialmente Fabricado": "var(--orange)",
      "Disponível para instalar": "var(--success)",
      "Instalado": "var(--teal)",
      "Orçamento Perdido": "var(--ink-soft)",
    }[status] || "var(--ink-soft)"
  );
}
/* Regra (nesta ordem, a primeira que bater vence):
   1. "Orçamento Perdido" é a única escolha manual — fica travada até
      alguém reativar o pedido explicitamente.
   2. Alguma peça já entrou em produção (tem statusProducao). Se todas as
      que entraram estão no MESMO estágio (todas "Em produção", ou todas
      "Disponível para instalar", ou todas "Instalado"), o pedido mostra
      esse estágio. Se estão espalhadas em estágios diferentes, mostra
      "Parcialmente Fabricado".
   3. Alguma peça com venda confirmada (ainda não enviada à produção) →
      "Venda Feita" — mais avançado do que só ter um valor lançado.
   4. TODAS as peças existentes já têm valor preenchido → "Orçamento
      Passado" — o orçamento só está pronto pra passar pro cliente quando
      não falta preço de nenhuma peça.
   5. Alguma peça (mas não todas) já tem valor preenchido — a vendedora
      está no meio da precificação → "Orçamento em Andamento".
   6. Alguma medição salva (qualquer quantidade) → "Medida Feita" — não
      faz sentido pedir para agendar medição se pelo menos uma já foi tirada.
   7. Existe uma "Medida" agendada na agenda para este pedido → "Medida Agendada".
   8. Nada disso → "Agendar Medição".
*/
function derivarStatusPedido(pedido, eventos) {
  if (pedido.status === "Orçamento Perdido") return "Orçamento Perdido";

  const pecas = pedido.ambientes.flatMap((a) => a.pecas);

  const estagiosProducao = pecas.map((p) => p.statusProducao).filter(Boolean);
  if (estagiosProducao.length > 0) {
    const unicos = new Set(estagiosProducao);
    return unicos.size === 1 ? estagiosProducao[0] : "Parcialmente Fabricado";
  }

  const temVendaFeita = pecas.some((p) => !!p.vendaFeitaEm);
  if (temVendaFeita) return "Venda Feita";

  const todasComValor = pecas.length > 0 && pecas.every((p) => p.valor != null);
  if (todasComValor) return "Orçamento Passado";

  const temValor = pecas.some((p) => p.valor != null);
  if (temValor) return "Orçamento em Andamento";

  const temMedicaoSalva = pecas.some((p) => p.locked);
  if (temMedicaoSalva) return "Medida Feita";

  const temMedicaoAgendada = eventos.some((e) => e.pedidoId === pedido.id && e.tipo === "Medida");
  if (temMedicaoAgendada) return "Medida Agendada";

  return "Agendar Medição";
}
/* Voltar uma etapa (só Gestor/Gestor Master, ver canVoltarEtapa): desfaz o
   campo que empurrou o pedido pra etapa atual, peça a peça, pra ele cair
   automaticamente na etapa anterior na próxima vez que o status for
   recalculado. Só cobre a esteira de produção (Venda Feita → Instalado) —
   é ali que um clique errado do dia a dia realmente precisa de conserto
   rápido; etapas antes disso (orçamento, medição) já se editam direto no
   pedido. "Parcialmente Fabricado" não entra por ser uma mistura de
   estágios diferentes — não teria uma única etapa "anterior" clara. */
const REVERTER_ETAPA = {
  Instalado: {
    anterior: "Disponível para instalar",
    aplicar: (p) =>
      p.statusProducao === "Instalado"
        ? { ...p, statusProducao: "Disponível para instalar", instaladoPor: null, instaladoEm: null }
        : p,
  },
  "Disponível para instalar": {
    anterior: "Em produção",
    aplicar: (p) =>
      p.statusProducao === "Disponível para instalar"
        ? { ...p, statusProducao: "Em produção", disponivelPor: null, disponivelEm: null }
        : p,
  },
  "Em produção": {
    anterior: "Venda Feita",
    aplicar: (p) => (p.statusProducao === "Em produção" ? { ...p, statusProducao: null, producaoPor: null, producaoEm: null } : p),
  },
  "Venda Feita": {
    anterior: "Orçamento Passado",
    aplicar: (p) => (p.vendaFeitaEm ? { ...p, vendaFeitaPor: null, vendaFeitaEm: null } : p),
  },
};
function podeVoltarEtapa(status) {
  return !!REVERTER_ETAPA[status];
}
function etapaAnteriorDe(status) {
  return REVERTER_ETAPA[status]?.anterior || null;
}
function aplicarVoltarEtapa(pedido) {
  const regra = REVERTER_ETAPA[pedido.status];
  if (!regra) return null;
  return {
    ...pedido,
    ambientes: pedido.ambientes.map((a) => ({ ...a, pecas: a.pecas.map(regra.aplicar) })),
  };
}
/* Fábrica enxerga pedidos nessas três etapas de produção (nada antes, nada
   de perdido/orçamento, nem depois de instalado) e, dentro deles, o
   pedido completo — mas nunca valores (isso já é travado por
   canVerValores em toda a interface). */
const STATUS_VISIVEIS_FABRICA = ["Em produção", "Parcialmente Fabricado", "Disponível para instalar"];
function statusVisivelParaFabrica(status) {
  return STATUS_VISIVEIS_FABRICA.includes(status);
}
/* Mesmo filtro por perfil usado na lista de pedidos e no Kanban — um único
   lugar evita que as duas visões um dia mostrem coisas diferentes.
   Instalador usa o sinalizador `disponivel` (peça a peça), não o status
   agregado do pedido — assim, mesmo num pedido "Parcialmente Fabricado"
   (uma peça ainda em produção, outra já disponível), ele continua vendo
   a peça que já pode instalar. */
function pedidosVisiveisParaPapel(index, papel) {
  if (papel === "Instalador") return index.filter((p) => p.disponivel);
  if (papel === "Fábrica") return index.filter((p) => statusVisivelParaFabrica(p.status));
  return index;
}
/* Sinalizadores leves guardados no índice (não o pedido inteiro) — usados
   só para filtrar/etiquetar a lista e alimentar o Funil/Painel sem
   precisar carregar cada pedido por completo. */
function indexFlagsFor(pedido) {
  const pecas = pedido.ambientes.flatMap((a) => a.pecas);
  return {
    status: pedido.status,
    vendedor: pedido.vendedor,
    disponivel: pecas.some((p) => p.statusProducao === "Disponível para instalar"),
    // Total = soma de tudo que tem valor lançado (orçamento, antes da venda
    // confirmada). Fechado = só das peças com venda já confirmada — é o
    // que o cartão do Funil mostra a partir de "Venda Feita" em diante.
    valorTotal: pecas.reduce((soma, p) => soma + (p.valor || 0), 0),
    valorFechado: pecas.filter((p) => !!p.vendaFeitaEm).reduce((soma, p) => soma + (p.valor || 0), 0),
    perdidoEm: pedido.status === "Orçamento Perdido" ? pedido.perdidoEm || null : null,
  };
}
/* Status a partir dos quais o pedido já teve pelo menos uma venda
   confirmada — usado pra decidir se o cartão do Funil mostra o valor
   fechado (venda) ou o valor de orçamento (ainda não confirmado). */
const STATUS_POS_VENDA_FEITA = [
  "Venda Feita",
  "Em produção",
  "Parcialmente Fabricado",
  "Disponível para instalar",
  "Instalado",
];
function mesAtualISO() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

/* Quanto foi vendido no mês atual: soma o valor das peças com venda
   confirmada (vendaFeitaEm) neste mês. Sem `nomeVendedor`, soma de todo
   mundo; com, só dos pedidos daquele vendedor. Usa o índice só para
   descobrir QUAIS pedidos entram na conta e depois busca cada um por
   completo, já que valor/venda vivem na peça, não no índice leve. */
async function calcularVendidoMes(nomeVendedor, index) {
  const relevantes = nomeVendedor ? index.filter((p) => p.vendedor === nomeVendedor) : index;
  const anoMes = mesAtualISO();
  let total = 0;
  for (const p of relevantes) {
    const pedido = await loadPedido(p.id);
    if (!pedido) continue;
    pedido.ambientes.forEach((a) =>
      a.pecas.forEach((peca) => {
        if (peca.valor && peca.vendaFeitaEm && peca.vendaFeitaEm.slice(0, 7) === anoMes) {
          total += peca.valor;
        }
      })
    );
  }
  return total;
}
/* Quanto foi perdido no mês atual: soma o valor total dos pedidos
   marcados "Orçamento Perdido" neste mês. Como isso é uma escolha manual
   no próprio pedido (não peça a peça), dá pra somar direto do índice —
   sem precisar carregar cada pedido. */
function calcularPerdidoMes(index, nomeVendedor = null) {
  const relevantes = nomeVendedor ? index.filter((p) => p.vendedor === nomeVendedor) : index;
  const anoMes = mesAtualISO();
  return relevantes
    .filter((p) => p.status === "Orçamento Perdido" && p.perdidoEm && p.perdidoEm.slice(0, 7) === anoMes)
    .reduce((soma, p) => soma + (p.valorTotal || 0), 0);
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
    orcamento: p.orcamento ?? null,
    historico: p.historico ?? [],
    statusProducao: p.statusProducao ?? null,
    vendaFeitaPor: p.vendaFeitaPor ?? null,
    vendaFeitaEm: p.vendaFeitaEm ?? null,
    producaoPor: p.producaoPor ?? null,
    producaoEm: p.producaoEm ?? null,
    disponivelPor: p.disponivelPor ?? null,
    disponivelEm: p.disponivelEm ?? null,
    instaladoPor: p.instaladoPor ?? null,
    instaladoEm: p.instaladoEm ?? null,
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
/* Máscara de telefone (XX) X-XXXX-XXXX — DDD + celular de 9 dígitos.
   Funciona tanto para formatar ao digitar quanto pra exibir um número já
   salvo (aceita qualquer formatação antiga, ignora tudo que não é dígito). */
function formatTelefone(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const resto = digits.slice(2);
  if (resto.length <= 1) return `(${ddd}) ${resto}`;
  if (resto.length <= 5) return `(${ddd}) ${resto[0]}-${resto.slice(1)}`;
  const primeiro = resto[0];
  const meio = resto.slice(1, 5);
  const fim = resto.slice(5, 9);
  return `(${ddd}) ${primeiro}-${meio}${fim ? "-" + fim : ""}`;
}
/* ------------------------------------------------------------
   COR DE DESTAQUE DO SISTEMA
   ------------------------------------------------------------
   Identidade visual única e fixa do sistema — veja --accent/--accent-soft/
   --accent-ink no CSS. As cores de status (venda feita, instalado etc.)
   são independentes e fixas: o significado das etiquetas nunca muda. */
const COR_MARCA = "#1F3A52";
const COR_BRASS = "#B98A3D";
function hexParaRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
// Mistura a cor com branco (amount 0..1) — usado pra gerar a versão clara
// (--accent-soft) a partir de qualquer cor escolhida.
function clarearCor(hex, amount) {
  const rgb = hexParaRgb(hex);
  if (!rgb) return hex;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return (
    "#" +
    [mix(rgb.r), mix(rgb.g), mix(rgb.b)].map((v) => v.toString(16).padStart(2, "0")).join("")
  );
}
// Decide se o texto sobre a cor escolhida deve ser branco ou escuro,
// conforme o quão clara/escura a cor é (evita texto ilegível em cores
// claras como amarelo ou dourado).
function corDeTextoSobre(hex) {
  const rgb = hexParaRgb(hex);
  if (!rgb) return "#FFFFFF";
  const luminancia = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminancia > 0.62 ? "#22241F" : "#FFFFFF";
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
/* Fecha o ciclo: só quem instala (ou gerencia) marca a peça como
   instalada de fato. Fábrica não — o trabalho dela termina em
   "disponível para instalar". */
function canMarcarInstalado(papel) {
  return papel === "Instalador" || papel === "Gestor" || papel === "Gestor Master";
}
/* Corrigir um clique errado: só Gestor/Gestor Master devolve o pedido pra
   etapa anterior da esteira de produção. */
function canVoltarEtapa(papel) {
  return papel === "Gestor" || papel === "Gestor Master";
}
function canVerComercial(papel) {
  return papel !== "Fábrica";
}
/* Edição das informações do pedido (cliente): Vendedor edita nome e
   telefone sempre, mas o endereço só antes de a medição ter sido feita
   (depois disso o instalador já vai contar com aquele endereço) — Gestor e
   Gestor Master editam tudo, sempre. O campo Vendedor responsável nunca é
   editável por um Vendedor, só por quem gerencia. */
function canEditClienteInfo(papel) {
  return papel === "Vendedor" || papel === "Gestor" || papel === "Gestor Master";
}
function canEditEndereco(pedido, papel) {
  if (papel === "Gestor" || papel === "Gestor Master") return true;
  if (papel !== "Vendedor") return false;
  const medicaoJaFeita = pedido.ambientes.flatMap((a) => a.pecas).some((p) => p.locked);
  return !medicaoJaFeita;
}
function canEditVendedorField(papel) {
  return papel === "Gestor" || papel === "Gestor Master";
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
  const [busca, setBusca] = useState("");
  const pedidoIdRef = useRef(null);
  const sessionRef = useRef(null);
  // Salvamento do pedido em edição: ver persistPedido/flushPedidoSave logo
  // abaixo — evita gravar a cada tecla digitada e evita que o eco do
  // Realtime da própria gravação atrapalhe quem está digitando.
  const saveTimeoutRef = useRef(null);
  const pendingPedidoRef = useRef(null);
  const ultimaEdicaoLocalRef = useRef(0);
  useEffect(() => {
    const idAnterior = pedidoIdRef.current;
    pedidoIdRef.current = pedido?.id || null;
    // Trocou de pedido (ou fechou a ficha): a marca de "acabei de editar"
    // era do pedido anterior, não deve mais bloquear o Realtime do atual.
    if (pedidoIdRef.current !== idAnterior) ultimaEdicaoLocalRef.current = 0;
  }, [pedido]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
      setUsuarios(await loadUsuarios());
      // Preços do Orçamento de cortinas: lidos uma vez do Supabase e
      // aplicados por cima dos valores combinados no código (ver
      // aplicarPrecosCarregados). Exige sessão autenticada (RLS), por
      // isso é recarregado de novo logo após o login também.
      aplicarPrecosCarregados(await loadPrecosOrcamento());
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

  // Tempo real: qualquer alteração em pedidos/eventos/perfis (feita por
  // qualquer pessoa, em qualquer aparelho) chega aqui na hora e atualiza o
  // estado local, sem precisar recarregar a página. RLS já garante que só
  // chegam as linhas que esta sessão tem permissão de ver.
  useEffect(() => {
    const unsubscribe = subscribeRealtime({
      onPedidoChange: ({ tipo, id, indexItem, pedido: pedidoAtualizado }) => {
        if (tipo === "DELETE") {
          setIndex((prev) => prev.filter((e) => e.id !== id));
          return;
        }
        setIndex((prev) => {
          const existe = prev.some((e) => e.id === id);
          if (existe) return prev.map((e) => (e.id === id ? { ...e, ...indexItem } : e));
          return [indexItem, ...prev];
        });
        if (pedidoIdRef.current === id) {
          // Se esta mesma aba editou este pedido há pouco (inclui a própria
          // gravação que acabou de disparar este evento, ecoada de volta
          // pelo Realtime), pula — o estado local já está igual ou mais
          // recente, e sobrescrever no meio da digitação é o que atrapalha.
          // Passado esse intervalo, aplica normalmente (edição vinda de
          // outro aparelho/pessoa).
          const acabouDeEditarAqui = Date.now() - ultimaEdicaoLocalRef.current < 1800;
          if (!acabouDeEditarAqui) setPedido(pedidoAtualizado);
        }
      },
      onEventoChange: ({ tipo, id, evento }) => {
        if (tipo === "DELETE") {
          setEventos((prev) => prev.filter((e) => e.id !== id));
          return;
        }
        setEventos((prev) => {
          const existe = prev.some((e) => e.id === evento.id);
          if (existe) return prev.map((e) => (e.id === evento.id ? evento : e));
          return [...prev, evento];
        });
      },
      onPerfilChange: ({ tipo, id, usuario }) => {
        if (tipo === "DELETE") {
          setUsuarios((prev) => prev.filter((u) => u.id !== id));
          return;
        }
        setUsuarios((prev) => {
          const existe = prev.some((u) => u.id === usuario.id);
          const next = existe ? prev.map((u) => (u.id === usuario.id ? usuario : u)) : [...prev, usuario];
          return next.sort((a, b) => a.nome.localeCompare(b.nome));
        });
        // Se o próprio perfil logado foi editado (ex.: gestor mudou papel ou
        // desativou a conta em outro aparelho), reflete na sessão atual.
        if (sessionRef.current && usuario.id === sessionRef.current.id) {
          if (usuario.ativo === false) {
            fazerLogout();
            setSession(null);
          } else {
            setSession(usuario);
          }
        }
      },
    });
    return unsubscribe;
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
            const next = prev.map((e) => (e.id === p.id ? { ...e, ...indexFlagsFor(p) } : e));
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

  // Grava de fato no Supabase o que estiver pendente (o pedido mais recente
  // passado a persistPedido), cancelando qualquer espera em andamento.
  // Chamado pelo temporizador de debounce e também "na mão" (flush) quando
  // a pessoa sai da ficha ou fecha a aba, pra nunca perder a última edição.
  const flushPedidoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const pendente = pendingPedidoRef.current;
    if (pendente) {
      pendingPedidoRef.current = null;
      savePedido(pendente);
    }
  }, []);

  const persistPedido = useCallback(
    async (updated) => {
      // Normaliza (peças antigas ganham os campos que faltam, ex.: valor) e
      // deriva o status dos dados — só "Orçamento Perdido" é manual.
      const normalizado = normalizarPedido(updated);
      const finalPedido = { ...normalizado, status: derivarStatusPedido(normalizado, eventos) };
      setPedido(finalPedido);
      ultimaEdicaoLocalRef.current = Date.now();

      // A gravação em si é "debounced": digitar rápido em um campo (nome do
      // tecido, medida, etc.) chama persistPedido a cada tecla, mas só
      // grava no banco meio segundo depois que a pessoa parar de digitar —
      // uma única escrita com o estado mais recente, em vez de uma por
      // tecla. Isso também reduz a chance do eco do Realtime (ver
      // onPedidoChange, abaixo) chegar no meio da digitação.
      pendingPedidoRef.current = finalPedido;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        const pendente = pendingPedidoRef.current;
        pendingPedidoRef.current = null;
        if (pendente) savePedido(pendente);
      }, 500);

      // Mantém o índice leve sincronizado com o status e com o sinalizador
      // "tem peça disponível para instalar" — é o que filtra/etiqueta a
      // lista por perfil (ex.: Instalador só vê o que pode instalar,
      // Fábrica só vê as etapas de produção).
      setIndex((prev) => {
        const next = prev.map((e) => (e.id === finalPedido.id ? { ...e, ...indexFlagsFor(finalPedido) } : e));
        saveIndex(next);
        return next;
      });
    },
    [eventos]
  );

  // Nunca deixa uma edição pendente se perder: grava na hora se a pessoa
  // fechar a aba/atualizar a página com uma escrita ainda esperando o debounce.
  useEffect(() => {
    window.addEventListener("beforeunload", flushPedidoSave);
    return () => window.removeEventListener("beforeunload", flushPedidoSave);
  }, [flushPedidoSave]);

  // Mesma ideia ao sair da ficha por QUALQUER caminho (voltar, menu,
  // logout, etc.) — não só o botão "Voltar" — pra nunca deixar uma edição
  // esperando o debounce for embora sem ser gravada.
  const routeScreenAnteriorRef = useRef(route.screen);
  useEffect(() => {
    if (routeScreenAnteriorRef.current === "ficha" && route.screen !== "ficha") {
      flushPedidoSave();
    }
    routeScreenAnteriorRef.current = route.screen;
  }, [route.screen, flushPedidoSave]);

  // Voltar etapa (Gestor/Gestor Master, geralmente disparado do Funil): o
  // pedido só tem o status leve no índice, então busca o pedido completo,
  // desfaz o campo que empurrou pra etapa atual e salva pelo mesmo caminho
  // de sempre (persistPedido já recalcula status e ressincroniza o índice).
  const voltarEtapaPedido = useCallback(
    async (pedidoId) => {
      const completo = await loadPedido(pedidoId);
      if (!completo) return;
      const revertido = aplicarVoltarEtapa(completo);
      if (revertido) await persistPedido(revertido);
    },
    [persistPedido]
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
      const nextIdx = prev.map((e) => (e.id === atualizado.id ? { ...e, ...indexFlagsFor(atualizado) } : e));
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
    // O carregamento inicial (useEffect de boot) roda antes de existir uma
    // sessão autenticada, então o que ele busca reflete as regras de quem
    // não está logado (RLS pode até bloquear tudo). Sem isso, a pessoa via
    // a tela recém-logada com dados desatualizados/vazios até a primeira
    // ação forçar um recarregamento. Agora, assim que o login é confirmado,
    // recarrega tudo já com a permissão da sessão nova.
    const [idx, evts, users, precos] = await Promise.all([loadIndex(), loadEventos(), loadUsuarios(), loadPrecosOrcamento()]);
    setIndex(idx);
    setEventos(evts);
    setUsuarios(users);
    aplicarPrecosCarregados(precos);
    return true;
  };

  const handleLogout = async () => {
    await fazerLogout();
    setSession(null);
    setShowUserMenu(false);
    setRoute({ screen: "lista" });
  };

  // Buscar filtra a lista de pedidos que já está na tela (Pedidos, Funil
  // ou Calendário — cada uma na sua própria forma), sem trocar de tela.
  const handleBuscaChange = (valor) => setBusca(valor);

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
      onOpenKanban={() => setRoute({ screen: "kanban" })}
      onOpenPainel={() => setRoute({ screen: "painel" })}
      onGoHome={() => setRoute({ screen: "lista" })}
      showHome={route.screen !== "lista"}
      fillHeight={route.screen === "kanban"}
      wide={route.screen === "kanban"}
      onLogout={handleLogout}
      busca={busca}
      onBuscaChange={handleBuscaChange}
      userMenu={
        showUserMenu && (
          <UserMenuOverlay
            session={session}
            index={index}
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
        )
      }
    >
      {route.screen === "lista" && (
        <PedidosList
          index={index}
          busca={busca}
          papel={session.papel}
          nome={session.nome}
          usuarios={usuarios}
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
            usuarios={usuarios}
            onChange={persistPedido}
            onOpenPeca={(ambienteId, pecaId) =>
              setRoute({ screen: "ficha", pedidoId: pedido.id, ambienteId, pecaId })
            }
            eventos={eventos.filter((e) => e.pedidoId === pedido.id)}
            todosEventos={eventos}
            onCriarEvento={criarEvento}
            onExcluirEvento={excluirEvento}
            onAbrirCalendario={() => setRoute({ screen: "calendario" })}
            onIrParaPedidos={() => setRoute({ screen: "lista" })}
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
          onBack={() => {
            flushPedidoSave();
            setRoute({ screen: "pedido", pedidoId: pedido.id });
          }}
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
          busca={busca}
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

      {route.screen === "kanban" && canVerCalendario(session.papel) && (
        <KanbanScreen
          index={index}
          busca={busca}
          papel={session.papel}
          nome={session.nome}
          onBack={() => setRoute({ screen: "lista" })}
          onAbrirPedido={(pedidoId) => {
            openPedido(pedidoId);
          }}
          onVoltarEtapa={voltarEtapaPedido}
        />
      )}

      {route.screen === "painel" && canGerenciarUsuarios(session.papel) && (
        <PainelGestorScreen usuarios={usuarios} index={index} onBack={() => setRoute({ screen: "lista" })} />
      )}
    </Shell>
  );
}

/* ============================================================
   SHELL / CHROME
   ============================================================ */
function Shell({
  children,
  session,
  onOpenUserMenu,
  onOpenCalendario,
  onOpenKanban,
  onOpenPainel,
  onGoHome,
  showHome,
  fillHeight,
  wide,
  onLogout,
  busca,
  onBuscaChange,
  userMenu,
}) {
  const [railOpen, setRailOpen] = useState(false);
  const corAccent = COR_MARCA;
  const corAccentSoft = clarearCor(corAccent, 0.86);
  const corAccentInk = corDeTextoSobre(corAccent);

  return (
    <div className="app-shell" style={{ fontFamily: "var(--sans)", background: "var(--bg)", color: "var(--ink)" }}>
      <style>{`
        ${FONT_IMPORT}
        :root {
          --bg: #F1ECE0;
          --surface: #FFFFFF;
          --ink: #211D1A;
          --ink-soft: #6E6558;
          --line: #E1D7C4;
          --accent: ${corAccent};
          --accent-ink: ${corAccentInk};
          --accent-soft: ${corAccentSoft};
          --brass: ${COR_BRASS};
          --locked: #97372A;
          --locked-soft: #F3E3DF;
          --success: #3E6B50;
          --success-soft: #E4EDE6;
          --amber: #B8860B;
          --amber-soft: #F5ECD6;
          --orange: #C1631A;
          --orange-soft: #F3E1CF;
          --teal: #1B6E76;
          --teal-soft: #DCEBEC;
          --rose: #A34D61;
          --rose-soft: #F1DDE2;
          --mono: 'IBM Plex Mono', ui-monospace, monospace;
          --sans: 'IBM Plex Sans', system-ui, sans-serif;
          --shadow-sm: 0 1px 2px rgba(33,29,26,0.07), 0 1px 1px rgba(33,29,26,0.05);
          --shadow-md: 0 8px 24px rgba(33,29,26,0.12), 0 2px 6px rgba(33,29,26,0.08);
        }
        * { box-sizing: border-box; }
        html, body, #root { height: 100%; margin: 0; }
        body { overflow: hidden; background: var(--bg); }
        button { font-family: inherit; cursor: pointer; transition: filter 0.12s ease, box-shadow 0.12s ease, transform 0.05s ease, background-color 0.12s ease; }
        button:not(:disabled):hover { filter: brightness(0.96); }
        button:not(:disabled):active { transform: translateY(1px); }
        input, select, textarea { font-family: inherit; }
        input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible {
          outline: 2px solid var(--accent); outline-offset: 1px;
        }
        /* Layout de duas colunas de verdade: a barra lateral é uma coluna
           flex normal (não flutua por cima) — por isso ocupa a altura
           inteira da tela, e o header/conteúdo começam exatamente onde ela
           termina, nunca por baixo dela. */
        .app-shell {
          display: flex;
          flex-direction: row;
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
        }
        .nav-rail {
          position: relative;
          z-index: 10;
          flex-shrink: 0;
          height: 100%;
          background: var(--surface);
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: width 0.16s ease;
          padding-top: env(safe-area-inset-top, 0px);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .nav-rail.collapsed { width: 56px; }
        .nav-rail.expanded { width: 230px; }
        .app-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .app-header {
          flex-shrink: 0;
          padding-top: env(safe-area-inset-top, 0px);
          position: relative;
          z-index: 10;
        }
        .app-header::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--accent) 0%, var(--accent) 70%, var(--brass) 100%);
        }
        .header-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 360px) minmax(0, 1fr);
          align-items: center;
          gap: 12px;
          padding: 12px 20px;
        }
        .app-content {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .container { max-width: 640px; margin: 0 auto; padding: 0 14px 64px; }
        /* Modo largo (Funil): larga o teto de 640px e deixa só uns 24px de
           margem de cada lado em telas largas — em telas estreitas, max()
           garante que ainda cabe (vira 100% da tela). */
        .container--wide { max-width: max(640px, calc(100% - 48px)); }
        /* Celular: some com a marca da loja e o usuário do cabeçalho, e a
           barra lateral colapsada fica com largura 0 (some de vez — nada
           fica "por baixo" dela). O hambúrguer some do topo da barra e
           aparece no cabeçalho; clicando, a barra abre com largura real
           (230px) e empurra o cabeçalho/conteúdo pra direita dela — não é
           mais uma sobreposição. Fechada, só o cabeçalho existe e a página
           ocupa a largura toda (com a margem normal do conteúdo). */
        .rail-user-mobile,
        .header-hamburger-mobile { display: none !important; }
        @media (max-width: 640px) {
          .nav-rail.collapsed { width: 0; border-right: none; }
          .rail-hamburger-desktop { display: none !important; }
          .header-hamburger-mobile { display: flex !important; }
          .header-brand, .header-user-desktop { display: none !important; }
          .rail-user-mobile { display: flex !important; }
          .header-row { display: flex; align-items: center; gap: 10px; }
          /* Impede o zoom automático do navegador ao focar um campo — ele
             acontece sempre que a fonte do campo fica abaixo de 16px. */
          input, select, textarea { font-size: 16px !important; }
        }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      {session && (
        <NavRail
          session={session}
          open={railOpen}
          onToggle={() => setRailOpen((v) => !v)}
          onCollapse={() => setRailOpen(false)}
          onGoHome={onGoHome}
          onOpenCalendario={onOpenCalendario}
          onOpenKanban={onOpenKanban}
          onOpenPainel={onOpenPainel}
          onOpenUserMenu={onOpenUserMenu}
          onLogout={onLogout}
        />
      )}

      <div className="app-main">
        <header className="app-header" style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
          <div className="header-row">
            {session && (
              <button
                className="header-hamburger-mobile"
                onClick={() => setRailOpen((v) => !v)}
                title="Menu"
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  borderRadius: 4,
                  padding: "7px 8px",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <Menu size={16} color="var(--ink-soft)" />
              </button>
            )}
            <div
              onClick={onGoHome}
              className="header-brand"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: showHome ? "pointer" : "default",
                minWidth: 0,
                justifySelf: "start",
              }}
            >
              {showHome && <ArrowLeft size={18} color="var(--ink-soft)" style={{ flexShrink: 0 }} />}
              {!showHome && (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "var(--accent)",
                    color: "var(--brass)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  M
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: "0.2px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Cortinas Miriam Rios
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-soft)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Sistema de Gerenciamento de Clientes
                </div>
              </div>
            </div>

            <div style={{ justifySelf: "center", width: "100%", flex: "1 1 auto", minWidth: 0 }}>
              {session && <HeaderSearch value={busca} onChange={onBuscaChange} />}
            </div>

            <div className="header-user-desktop" style={{ justifySelf: "end" }}>
              {session && (
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
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      maxWidth: 120,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {session.nome}
                  </span>
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="app-content" style={fillHeight ? { overflow: "hidden" } : undefined}>
          <div
            className={wide ? "container container--wide" : "container"}
            style={fillHeight ? { height: "100%", display: "flex", flexDirection: "column", paddingBottom: 14 } : undefined}
          >
            {children}
          </div>
        </div>
      </div>

      {userMenu}
    </div>
  );
}

/* ============================================================
   BUSCA POR CLIENTE (cabeçalho, centralizada)
   ============================================================ */
function HeaderSearch({ value, onChange }) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <Search
        size={14}
        color="var(--ink-soft)"
        style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar cliente…"
        style={{ ...inputStyle(), padding: "7px 10px 7px 30px", fontSize: 12.5 }}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          title="Limpar busca"
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            padding: 4,
            display: "flex",
          }}
        >
          <X size={13} color="var(--ink-soft)" />
        </button>
      )}
    </div>
  );
}

/* ============================================================
   MENU LATERAL — coluna de verdade (não flutua): ocupa a altura inteira
   da tela e o header/conteúdo começam exatamente onde ela termina.
   Colapsada = só ícones (56px). Aberta (hambúrguer, que mora aqui dentro
   da própria barra) = ícone + nome (230px). Logout sempre fixo no rodapé,
   nos dois estados.
   ============================================================ */
function NavRail({ session, open, onToggle, onCollapse, onGoHome, onOpenCalendario, onOpenKanban, onOpenPainel, onOpenUserMenu, onLogout }) {
  const papel = session.papel;
  const ir = (fn) => {
    onCollapse();
    fn();
  };

  // Ordem: Painel (só Gestor/Gestor Master, primeiro) → Pedidos → Funil
  // (gráfico de barras "de cabeça pra baixo", lembrando um funil) →
  // Calendário (último).
  const itens = [];
  if (canGerenciarUsuarios(papel)) {
    itens.push({ Icon: LayoutGrid, label: "Painel", onClick: onOpenPainel });
  }
  itens.push({ Icon: ClipboardList, label: "Pedidos", onClick: onGoHome });
  if (canVerCalendario(papel)) {
    itens.push({ Icon: BarChart3, label: "Funil", onClick: onOpenKanban, rotate: true });
    itens.push({ Icon: CalendarDays, label: "Calendário", onClick: onOpenCalendario });
  }

  return (
    <nav className={open ? "nav-rail expanded" : "nav-rail collapsed"}>
      <div className="rail-hamburger-desktop" style={{ padding: "10px 8px" }}>
        <button onClick={onToggle} title="Menu" style={railItemStyle(open)}>
          <Menu size={18} style={{ flexShrink: 0 }} />
          {open && <span style={{ whiteSpace: "nowrap" }}>Menu</span>}
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "0 8px", overflowY: "auto" }}>
        {itens.map(({ Icon, label, onClick, rotate }) => (
          <button key={label} onClick={() => ir(onClick)} title={label} style={railItemStyle(open)}>
            <Icon size={18} style={{ flexShrink: 0, transform: rotate ? "rotate(180deg)" : undefined }} />
            {open && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
          </button>
        ))}
      </div>
      {/* Só no celular (ver .rail-user-mobile no CSS): usuário entra aqui,
          em cima do Sair, com uma única linha separando os dois do resto —
          no desktop o usuário continua no cabeçalho, e este bloco some. */}
      <div
        style={{
          padding: "10px 8px",
          borderTop: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <button className="rail-user-mobile" onClick={() => ir(onOpenUserMenu)} title={session.nome} style={railItemStyle(open)}>
          <RoleDot papel={papel} />
          {open && (
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.nome}</span>
          )}
        </button>
        <button onClick={onLogout} title="Sair" style={{ ...railItemStyle(open), color: "var(--locked)" }}>
          <LogOut size={18} style={{ flexShrink: 0 }} />
          {open && <span style={{ whiteSpace: "nowrap" }}>Sair</span>}
        </button>
      </div>
    </nav>
  );
}
function railItemStyle(open) {
  return {
    display: "flex",
    alignItems: "center",
    gap: open ? 10 : 0,
    justifyContent: open ? "flex-start" : "center",
    background: "none",
    border: "none",
    borderRadius: 6,
    padding: open ? "10px 10px" : "10px 0",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--ink)",
    width: "100%",
  };
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
function UserMenuOverlay({ session, index, onClose, onLogout, onOpenUsuarios }) {
  const [showInfo, setShowInfo] = useState(false);
  const [carregandoInfo, setCarregandoInfo] = useState(false);
  const [vendidoMes, setVendidoMes] = useState(null);

  const abrirInformacoes = async () => {
    const abrindo = !showInfo;
    setShowInfo(abrindo);
    if (abrindo && vendidoMes == null) {
      setCarregandoInfo(true);
      const total = await calcularVendidoMes(session.nome, index);
      setVendidoMes(total);
      setCarregandoInfo(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,18,0.4)",
        zIndex: 150,
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
          borderRadius: "14px 14px 0 0",
          padding: 20,
          boxShadow: "var(--shadow-md)",
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
          {canVerValores(session.papel) && (
            <>
              <button onClick={abrirInformacoes} style={{ ...ghostBtnStyle, justifyContent: "flex-start" }}>
                <Info size={15} /> Informações
              </button>
              {showInfo && (
                <div style={{ ...cardStyle, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 4 }}>
                    Vendido este mês ({new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })})
                  </div>
                  {carregandoInfo ? (
                    <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Calculando…</div>
                  ) : (
                    <div style={{ fontSize: 19, fontWeight: 700 }}>{fmtValor(vendidoMes || 0)}</div>
                  )}
                  <div style={{ fontSize: 10.5, color: "var(--ink-soft)", marginTop: 4 }}>
                    Soma das peças enviadas para produção neste mês, em pedidos seus.
                  </div>
                </div>
              )}
            </>
          )}
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
/* ============================================================
   PAINEL DO GESTOR — quanto cada vendedor rendeu no mês
   ------------------------------------------------------------
   Reaproveita calcularVendidoMes (a mesma conta que o próprio vendedor vê
   em "Informações"), só que para todo mundo que pode ser vendedor de um
   pedido (Vendedor, Gestor, Gestor Master), lado a lado.
   ============================================================ */
function PainelGestorScreen({ usuarios, index, onBack }) {
  const [carregando, setCarregando] = useState(true);
  const [dados, setDados] = useState([]); // [{ usuario, vendas, perdido }]

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCarregando(true);
      const relevantes = usuarios.filter(
        (u) => ["Vendedor", "Gestor", "Gestor Master"].includes(u.papel) && u.ativo !== false
      );
      const resultados = await Promise.all(
        relevantes.map(async (u) => ({
          usuario: u,
          vendas: await calcularVendidoMes(u.nome, index),
          perdido: calcularPerdidoMes(index, u.nome),
        }))
      );
      resultados.sort((a, b) => b.vendas - a.vendas);
      if (!cancelado) {
        setDados(resultados);
        setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [usuarios, index]);

  const totalVendas = dados.reduce((soma, d) => soma + d.vendas, 0);
  const totalPerdido = dados.reduce((soma, d) => soma + d.perdido, 0);

  return (
    <div style={{ paddingTop: 18 }}>
      <button onClick={onBack} style={{ ...ghostBtnStyle, marginBottom: 14 }}>
        <ArrowLeft size={14} /> Voltar
      </button>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>Painel de vendas</h1>
      <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 16, textTransform: "capitalize" }}>
        {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
      </div>

      {carregando ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-soft)" }}>Calculando…</div>
      ) : (
        <>
          {/* Um quadro só, com os dois blocos (Vendas feitas / Orçamentos
              perdidos) empilhados um embaixo do outro dentro dele. */}
          <PainelResumoCard titulo="Total geral" vendas={totalVendas} perdido={totalPerdido} style={{ marginBottom: 16 }} />

          {dados.length === 0 ? (
            <div style={emptyStateStyle}>Nenhum vendedor/gestor cadastrado ainda.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dados.map(({ usuario, vendas, perdido }) => (
                <PainelResumoCard
                  key={usuario.id}
                  titulo={usuario.nome}
                  papel={usuario.papel}
                  vendas={vendas}
                  perdido={perdido}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* Um quadro (cardStyle) com dois blocos dentro, um embaixo do outro: Vendas
   feitas em cima, Orçamentos perdidos embaixo. Usado tanto para o resumo
   geral (sem `titulo`) quanto para o quadro de cada vendedor (com
   `titulo`/`papel`) — sempre a mesma estrutura de "1 quadro com 2 dentro". */
function PainelResumoCard({ titulo, papel, vendas, perdido, style }) {
  return (
    <div style={{ ...cardStyle, ...style }}>
      {titulo && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, minWidth: 0 }}>
          {papel && <RoleDot papel={papel} />}
          <span
            style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {titulo}
          </span>
        </div>
      )}
      <div style={{ paddingBottom: 10, borderBottom: "1px solid var(--line)", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 3 }}>Vendas feitas</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--success)" }}>{fmtValor(vendas)}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 3 }}>Orçamentos perdidos</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--locked)" }}>{fmtValor(perdido)}</div>
      </div>
    </div>
  );
}

function UsuariosScreen({ session, usuarios, onBack, onUsuariosChange }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

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
function CalendarScreen({ eventos, index, busca, papel, nome, onCriarEvento, onExcluirEvento, onBack, onAbrirPedido }) {
  const hoje = new Date();
  const [mesRef, setMesRef] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [diaSelecionado, setDiaSelecionado] = useState(fmtISODate(hoje));
  const [showForm, setShowForm] = useState(false);

  const buscaNorm = (busca || "").trim().toLowerCase();
  const eventosFiltrados = buscaNorm
    ? eventos.filter((e) => e.cliente && e.cliente.toLowerCase().includes(buscaNorm))
    : eventos;

  const eventosPorDia = useMemo(() => {
    const map = {};
    eventosFiltrados.forEach((e) => {
      (map[e.data] = map[e.data] || []).push(e);
    });
    return map;
  }, [eventosFiltrados]);

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
      {buscaNorm && (
        <div style={{ ...missingTextStyle, color: "var(--ink-soft)", marginBottom: 10, marginTop: -6 }}>
          Mostrando só agendamentos de clientes com "{busca}" no nome.
        </div>
      )}

      <>
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
                eventos={eventos}
                papel={papel}
                nome={nome}
                dataPreset={diaSelecionado}
                onCancel={() => setShowForm(false)}
                onSaved={onCriarEvento}
                onFinalizado={() => setShowForm(false)}
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
      </>
    </div>
  );
}

/* ============================================================
   FUNIL / KANBAN — tela própria, separada do calendário
   ============================================================ */
function KanbanScreen({ index, busca, papel, nome, onBack, onAbrirPedido, onVoltarEtapa }) {
  const buscaNorm = (busca || "").trim();
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", paddingTop: 18 }}>
      <button onClick={onBack} style={{ ...ghostBtnStyle, marginBottom: 14, flexShrink: 0, alignSelf: "flex-start" }}>
        <ArrowLeft size={14} /> Voltar
      </button>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: buscaNorm ? 4 : 14, flexShrink: 0 }}>Funil</h1>
      {buscaNorm && (
        <div style={{ ...missingTextStyle, color: "var(--ink-soft)", marginBottom: 10, flexShrink: 0 }}>
          Mostrando só clientes com "{busca}" no nome.
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <KanbanBoard index={index} busca={busca} papel={papel} nome={nome} onAbrirPedido={onAbrirPedido} onVoltarEtapa={onVoltarEtapa} />
      </div>
    </div>
  );
}

/* ============================================================
   KANBAN — visão do funil (pedidos agrupados por status)
   ------------------------------------------------------------
   Ocupa a altura toda disponível: o quadro rola na horizontal (colunas),
   e cada coluna rola na vertical por conta própria — assim uma etapa com
   100 pedidos ganha sua própria barra de rolagem sem esticar a tela nem
   empurrar as outras colunas.
   Não dá para arrastar um card para outra coluna, porque o status é
   calculado automaticamente a partir dos dados (medição salva, valor
   preenchido, produção, agenda) — arrastar um pedido para "Medida Feita"
   não mudaria o fato de a medida não ter sido salva. Em vez de arrastar,
   Gestor e Gestor Master têm um botão "voltar etapa" no próprio cartão
   pra desfazer um clique errado na esteira de produção (Venda Feita →
   Instalado) — a única mudança manual de status fora disso continua
   sendo marcar/reativar "Orçamento Perdido" na tela do próprio pedido.
   Vendedor só enxerga os próprios cartões — cada um vê só o que é dele,
   Gestor e Gestor Master continuam vendo tudo.
   ============================================================ */
function KanbanBoard({ index, busca, papel, nome, onAbrirPedido, onVoltarEtapa }) {
  const [confirmando, setConfirmando] = useState(null); // pedido (do índice) que está pra voltar de etapa
  const [voltando, setVoltando] = useState(false);

  const visiveisPapel = pedidosVisiveisParaPapel(index, papel);
  const visiveisVendedor = papel === "Vendedor" ? visiveisPapel.filter((p) => p.vendedor === nome) : visiveisPapel;
  const buscaNorm = (busca || "").trim().toLowerCase();
  const visiveis = buscaNorm
    ? visiveisVendedor.filter((p) => p.cliente && p.cliente.toLowerCase().includes(buscaNorm))
    : visiveisVendedor;

  const porStatus = useMemo(() => {
    const map = {};
    STATUS_PEDIDO.forEach((s) => (map[s] = []));
    visiveis.forEach((p) => {
      const s = p.status || "Agendar Medição";
      (map[s] = map[s] || []).push(p);
    });
    return map;
  }, [visiveis]);

  const confirmarVoltar = async () => {
    if (!confirmando) return;
    setVoltando(true);
    await onVoltarEtapa(confirmando.id);
    setVoltando(false);
    setConfirmando(null);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        height: "100%",
        overflowX: "auto",
        overflowY: "hidden",
        margin: "0 -14px",
        padding: "0 14px 10px",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {confirmando && (
        <ConfirmDialog
          title={`Voltar "${confirmando.cliente}" para "${etapaAnteriorDe(confirmando.status)}"?`}
          message={`O pedido está em "${confirmando.status}". Essa ação desfaz o último avanço dele na esteira de produção.`}
          confirmLabel={voltando ? "Voltando…" : "Voltar etapa"}
          onConfirm={confirmarVoltar}
          onCancel={() => setConfirmando(null)}
        />
      )}
      {STATUS_PEDIDO.map((status) => {
        const pedidosDoStatus = (porStatus[status] || []).slice().sort((a, b) => b.numero - a.numero);
        const cor = statusPedidoColor(status);
        return (
          <div
            key={status}
            style={{ minWidth: 208, maxWidth: 208, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "0 2px", flexShrink: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: cor, flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.2 }}>{status}</span>
              <span style={{ fontSize: 11, color: "var(--ink-soft)", marginLeft: "auto", flexShrink: 0 }}>
                {pedidosDoStatus.length}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                paddingBottom: 4,
              }}
            >
              {pedidosDoStatus.length === 0 ? (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--ink-soft)",
                    border: "1px dashed var(--line)",
                    borderRadius: 6,
                    padding: "12px 8px",
                    textAlign: "center",
                  }}
                >
                  Vazio
                </div>
              ) : (
                pedidosDoStatus.map((p) => {
                  const vendaJaFeita = STATUS_POS_VENDA_FEITA.includes(p.status);
                  const valorExibido = vendaJaFeita ? p.valorFechado : p.valorTotal;
                  const mostrarVoltar = canVoltarEtapa(papel) && podeVoltarEtapa(p.status);
                  return (
                    <div
                      key={p.id}
                      style={{
                        position: "relative",
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderLeft: `3px solid ${cor}`,
                        borderRadius: 6,
                        flexShrink: 0,
                      }}
                    >
                      <button
                        onClick={() => onAbrirPedido(p.id)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          background: "none",
                          border: "none",
                          padding: mostrarVoltar ? "8px 26px 8px 10px" : "8px 10px",
                        }}
                      >
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-soft)" }}>
                          {pedidoLabel(p.numero)}
                        </div>
                        <div style={{ fontSize: 12.5, marginTop: 3 }}>
                          <span style={{ color: "var(--ink-soft)" }}>Nome - </span>
                          <span style={{ fontWeight: 600 }}>{p.cliente}</span>
                        </div>
                        <div style={{ fontSize: 11.5, marginTop: 1 }}>
                          <span style={{ color: "var(--ink-soft)" }}>Vendedor - </span>
                          <span style={{ fontWeight: 500 }}>{p.vendedor || "—"}</span>
                        </div>
                        {canVerValores(papel) && (
                          <div style={{ fontSize: 11.5, marginTop: 1 }}>
                            <span style={{ color: "var(--ink-soft)" }}>Valor - </span>
                            <span style={{ fontWeight: 600 }}>{valorExibido ? fmtValor(valorExibido) : "—"}</span>
                          </div>
                        )}
                      </button>
                      {mostrarVoltar && (
                        <button
                          onClick={() => setConfirmando(p)}
                          title={`Voltar para "${etapaAnteriorDe(p.status)}"`}
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            background: "var(--bg)",
                            border: "1px solid var(--line)",
                            borderRadius: 999,
                            width: 20,
                            height: 20,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--ink-soft)",
                          }}
                        >
                          <RotateCcw size={11} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendarForm({ index = [], eventos = [], papel, nome, pedidoPreset, dataPreset, tipoFixo, onCancel, onSaved, onFinalizado }) {
  const [pedidoId, setPedidoId] = useState(pedidoPreset?.id || "");
  const [data, setData] = useState(dataPreset || fmtISODate(new Date()));
  const [hora, setHora] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const pedidoEscolhido = pedidoPreset || index.find((p) => p.id === pedidoId);

  // Sem tipo fixo (formulário genérico do Calendário): os tipos possíveis
  // dependem do pedido escolhido — só oferece "Instalação" se ele já tiver
  // peça disponível para instalar.
  const tiposPermitidos = tipoFixo
    ? [tipoFixo]
    : [
        canAgendarMedida(papel) && "Medida",
        canAgendarInstalacao(papel) && pedidoEscolhido?.disponivel && "Instalação",
      ].filter(Boolean);
  const [tipo, setTipo] = useState(tipoFixo || tiposPermitidos[0] || "Medida");
  const tipoAtual = tiposPermitidos.includes(tipo) ? tipo : tiposPermitidos[0];

  // Quem mede também instala (por enquanto) — não dá pra ter dois
  // compromissos no mesmo dia, seja qual for o tipo.
  const diaOcupado = !!data && eventos.some((e) => e.data === data);

  const canSave = !!pedidoEscolhido && !!data && !!tipoAtual && !diaOcupado;

  const dataFormatada = data
    ? new Date(data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "";

  const confirmarEAgendar = async () => {
    setConfirmando(false);
    setSaving(true);
    await onSaved({
      id: uid(),
      pedidoId: pedidoEscolhido.id,
      pedidoNumero: pedidoEscolhido.numero,
      cliente: pedidoEscolhido.cliente,
      tipo: tipoAtual,
      data,
      hora: hora || null,
      observacao: observacao.trim(),
      criadoPor: nome,
      criadoEm: nowParts().iso,
    });
    setSaving(false);
    setSucesso(true);
  };

  if (tiposPermitidos.length === 0) {
    return (
      <div style={emptyStateStyle}>
        {tipoFixo === "Instalação"
          ? "Este pedido ainda não tem nenhuma peça disponível para instalar."
          : "Seu perfil não pode criar agendamentos."}
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      {confirmando && (
        <ConfirmDialog
          title={`Agendar ${tipoAtual} para dia ${dataFormatada}${hora ? ` às ${hora}hrs` : ""}?`}
          message={`Pedido ${pedidoLabel(pedidoEscolhido.numero)} — ${pedidoEscolhido.cliente}.`}
          confirmLabel="Agendar"
          onConfirm={confirmarEAgendar}
          onCancel={() => setConfirmando(false)}
        />
      )}
      {sucesso && (
        <ConfirmDialog
          title={`${tipoAtual} agendada!`}
          message={`${tipoAtual} marcada para dia ${dataFormatada}${hora ? ` às ${hora}hrs` : ""}. Você pode ver e remover esse agendamento a qualquer momento no calendário.`}
          confirmLabel="OK"
          onConfirm={() => {
            setSucesso(false);
            onFinalizado ? onFinalizado() : onCancel();
          }}
          onCancel={() => {
            setSucesso(false);
            onFinalizado ? onFinalizado() : onCancel();
          }}
        />
      )}

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

      {!tipoFixo && tiposPermitidos.length > 1 && (
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
                  border: tipoAtual === t ? "1.5px solid var(--accent)" : "1px solid var(--line)",
                  background: tipoAtual === t ? "var(--accent-soft)" : "var(--surface)",
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
      {diaOcupado && (
        <div style={missingTextStyle}>
          Esse dia já tem um agendamento — quem mede também instala, então não dá pra marcar dois no mesmo dia.
        </div>
      )}

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
          onClick={() => setConfirmando(true)}
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
function PedidosList({ index, busca, papel, nome, usuarios, onOpen, onCreated }) {
  const [showForm, setShowForm] = useState(false);
  const visiveis = pedidosVisiveisParaPapel(index, papel);
  const buscaNorm = (busca || "").trim().toLowerCase();
  const filtrados = buscaNorm
    ? visiveis.filter((p) => p.cliente && p.cliente.toLowerCase().includes(buscaNorm))
    : visiveis;
  const sorted = [...filtrados].sort((a, b) => b.numero - a.numero);

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
          nome={nome}
          usuarios={usuarios}
          onCancel={() => setShowForm(false)}
          onCreated={(id) => {
            setShowForm(false);
            onCreated(id);
          }}
        />
      )}

      {sorted.length === 0 && !showForm && (
        <div style={emptyStateStyle}>
          {buscaNorm
            ? "Nenhum cliente encontrado com esse nome."
            : papel === "Instalador"
            ? "Nenhum pedido disponível para instalar/entregar no momento."
            : papel === "Fábrica"
            ? "Nenhum pedido em produção no momento."
            : "Nenhum pedido cadastrado ainda."}
          {!buscaNorm && canEditStructure(papel) && ' Toque em "Novo pedido" para começar uma medição.'}
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

function NovoPedidoForm({ papel, nome, usuarios, onCancel, onCreated }) {
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  // Vendedor é seleção, não texto livre: Vendedor sempre fica com o próprio
  // nome (fixo); Gestor/Gestor Master começam com o próprio nome mas podem
  // trocar por qualquer Vendedor/Gestor/Gestor Master ativo.
  const [vendedor, setVendedor] = useState(nome || "");
  const [saving, setSaving] = useState(false);
  const vendedorTravado = papel === "Vendedor";

  const usuariosVendedores = usuarios
    .filter((u) => ["Vendedor", "Gestor", "Gestor Master"].includes(u.papel) && u.ativo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome));

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
      vendedor: (vendedorTravado ? nome : vendedor) || "",
      criadoEm: nowParts().iso,
      status: "Agendar Medição",
      ambientes: [],
    };
    await savePedido(pedido);
    const idx = await loadIndex();
    idx.push({
      id: pedido.id,
      numero: pedido.numero,
      cliente: pedido.cliente,
      criadoEm: pedido.criadoEm,
      status: pedido.status,
      vendedor: pedido.vendedor,
    });
    await saveIndex(idx);
    setSaving(false);
    onCreated(pedido.id);
  };

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Novo pedido</div>
      <label style={labelStyle}>Nome do cliente</label>
      <input value={cliente} onChange={(e) => setCliente(e.target.value)} style={inputStyle()} placeholder="Ex.: João da Silva" />
      <label style={{ ...labelStyle, marginTop: 10 }}>Telefone</label>
      <input
        value={telefone}
        onChange={(e) => setTelefone(formatTelefone(e.target.value))}
        style={inputStyle()}
        inputMode="numeric"
        placeholder="(00) 0-0000-0000"
      />
      <label style={{ ...labelStyle, marginTop: 10 }}>Endereço da obra</label>
      <input value={endereco} onChange={(e) => setEndereco(e.target.value)} style={inputStyle()} placeholder="Rua, número, bairro" />
      <label style={{ ...labelStyle, marginTop: 10 }}>Vendedor responsável</label>
      {vendedorTravado ? (
        <div
          style={{
            ...inputStyle(),
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--ink-soft)",
            background: "var(--bg)",
          }}
        >
          <RoleDot papel="Vendedor" /> {nome}
        </div>
      ) : (
        <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} style={inputStyle()}>
          <option value="">Selecione o vendedor…</option>
          {usuariosVendedores.map((u) => (
            <option key={u.id} value={u.nome}>
              {u.nome} ({u.papel})
            </option>
          ))}
        </select>
      )}

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
  usuarios = [],
  onChange,
  onOpenPeca,
  eventos = [],
  todosEventos = [],
  onCriarEvento,
  onExcluirEvento,
  onAbrirCalendario,
  onIrParaPedidos,
}) {
  const [expanded, setExpanded] = useState(() => new Set(pedido.ambientes.slice(0, 1).map((a) => a.id)));
  const [showNovoAmbiente, setShowNovoAmbiente] = useState(false);
  const [agendaFormTipo, setAgendaFormTipo] = useState(null); // "Medida" | "Instalação" | null
  const [editandoInfo, setEditandoInfo] = useState(false);

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
          vendaFeitaPor: null,
          vendaFeitaEm: null,
          producaoPor: null,
          producaoEm: null,
          disponivelPor: null,
          disponivelEm: null,
          instaladoPor: null,
          instaladoEm: null,
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
  const marcarOrcamentoPerdido = () =>
    onChange({ ...pedido, status: "Orçamento Perdido", perdidoEm: nowParts().iso });
  const reativarPedido = () => onChange({ ...pedido, status: null, perdidoEm: null });

  const todasPecas = pedido.ambientes.flatMap((a) => a.pecas);
  const pendentesVenda = todasPecas.filter((p) => p.locked && !p.vendaFeitaEm).length;
  const pendentesProducao = todasPecas.filter((p) => p.locked && p.vendaFeitaEm && !p.statusProducao).length;
  const emProducaoCount = todasPecas.filter((p) => p.statusProducao === "Em produção").length;
  const disponivelCount = todasPecas.filter((p) => p.statusProducao === "Disponível para instalar").length;
  const valorTotal = todasPecas.reduce((soma, p) => soma + (p.valor || 0), 0);
  const temValorLancado = todasPecas.some((p) => p.valor != null);
  // Valor fechado: soma só das peças com venda confirmada — é o que o
  // vendedor efetivamente fechou com o cliente, diferente do valor total
  // (que inclui peças ainda em orçamento, sem venda confirmada).
  const valorFechado = todasPecas.filter((p) => !!p.vendaFeitaEm).reduce((soma, p) => soma + (p.valor || 0), 0);

  const [confirmandoBulk, setConfirmandoBulk] = useState(null); // "venda" | "producao" | "disponivel" | "instalado"

  const marcarVendasFeitas = () => {
    const { iso } = nowParts();
    const updated = {
      ...pedido,
      ambientes: pedido.ambientes.map((a) => ({
        ...a,
        pecas: a.pecas.map((p) => (p.locked && !p.vendaFeitaEm ? { ...p, vendaFeitaPor: nome, vendaFeitaEm: iso } : p)),
      })),
    };
    onChange(updated);
    setConfirmandoBulk(null);
  };

  const enviarConcluidosParaProducao = () => {
    const { iso } = nowParts();
    const updated = {
      ...pedido,
      ambientes: pedido.ambientes.map((a) => ({
        ...a,
        pecas: a.pecas.map((p) =>
          p.locked && p.vendaFeitaEm && !p.statusProducao
            ? { ...p, statusProducao: "Em produção", producaoPor: nome, producaoEm: iso }
            : p
        ),
      })),
    };
    onChange(updated);
    setConfirmandoBulk(null);
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
    setConfirmandoBulk(null);
  };

  const marcarInstaladas = () => {
    const { iso } = nowParts();
    const updated = {
      ...pedido,
      ambientes: pedido.ambientes.map((a) => ({
        ...a,
        pecas: a.pecas.map((p) =>
          p.statusProducao === "Disponível para instalar"
            ? { ...p, statusProducao: "Instalado", instaladoPor: nome, instaladoEm: iso }
            : p
        ),
      })),
    };
    onChange(updated);
    setConfirmandoBulk(null);
  };

  const dialogosBulk = {
    venda: {
      title: `Confirmar venda de ${pendentesVenda} peça(s)?`,
      message: "Marca como fechadas com o cliente todas as peças com medição salva que ainda não tinham venda confirmada.",
      confirmLabel: "Marcar venda feita",
      onConfirm: marcarVendasFeitas,
    },
    producao: {
      title: `Enviar ${pendentesProducao} peça(s) para produção?`,
      message: "A fábrica passa a enxergar essas peças a partir de agora.",
      confirmLabel: "Enviar para produção",
      onConfirm: enviarConcluidosParaProducao,
    },
    disponivel: {
      title: `Marcar ${emProducaoCount} peça(s) disponível para instalar?`,
      message: "O instalador passa a ver essas peças na fila dele.",
      confirmLabel: "Marcar disponível",
      onConfirm: marcarObraDisponivel,
    },
    instalado: {
      title: `Marcar ${disponivelCount} peça(s) como instalada(s)?`,
      message: "Essa é a última etapa — depois disso elas saem da fila de instalação.",
      confirmLabel: "Marcar instalado",
      onConfirm: marcarInstaladas,
    },
  };
  const dialogoBulk = confirmandoBulk && dialogosBulk[confirmandoBulk];

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, marginBottom: 8 }}>
        <h1 style={{ fontSize: 19, fontWeight: 600, flex: 1, minWidth: 0 }}>{pedido.cliente}</h1>
        {canEditClienteInfo(papel) && !editandoInfo && (
          <button
            onClick={() => setEditandoInfo(true)}
            title="Editar informações do pedido"
            style={{ background: "none", border: "none", padding: 4, color: "var(--ink-soft)", flexShrink: 0 }}
          >
            <Pencil size={16} />
          </button>
        )}
      </div>

      {editandoInfo ? (
        <EditarPedidoInfo
          pedido={pedido}
          papel={papel}
          usuarios={usuarios}
          onChange={onChange}
          onCancel={() => setEditandoInfo(false)}
        />
      ) : (
        (showContact || (canVerValores(papel) && temValorLancado)) && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
            <div style={{ lineHeight: 1.6 }}>
              {showContact && pedido.telefone && (
                <div style={{ fontSize: 15.5, fontWeight: 500, color: "var(--ink)", marginBottom: 2 }}>
                  {formatTelefone(pedido.telefone)}
                </div>
              )}
              {showContact && pedido.endereco && <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{pedido.endereco}</div>}
              {showContact && pedido.vendedor && (
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Vendedor: {pedido.vendedor}</div>
              )}
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
        )
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

      {dialogoBulk && (
        <ConfirmDialog
          title={dialogoBulk.title}
          message={dialogoBulk.message}
          confirmLabel={dialogoBulk.confirmLabel}
          onConfirm={dialogoBulk.onConfirm}
          onCancel={() => setConfirmandoBulk(null)}
        />
      )}
      {canEnviarProducao(papel) && pendentesVenda > 0 && (
        <button
          onClick={() => setConfirmandoBulk("venda")}
          style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center", marginBottom: 8, color: "var(--rose)" }}
        >
          <Check size={14} /> Marcar {pendentesVenda} peça(s) com venda feita
        </button>
      )}
      {canEnviarProducao(papel) && pendentesProducao > 0 && (
        <button onClick={() => setConfirmandoBulk("producao")} style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center", marginBottom: 8 }}>
          <Factory size={14} /> Enviar {pendentesProducao} peça(s) vendida(s) para produção
        </button>
      )}
      {canAvancarInstalar(papel) && emProducaoCount > 0 && (
        <button onClick={() => setConfirmandoBulk("disponivel")} style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center", marginBottom: 8, color: "var(--success)" }}>
          <Truck size={14} /> Marcar {emProducaoCount} peça(s) disponível para instalar
        </button>
      )}
      {canMarcarInstalado(papel) && disponivelCount > 0 && (
        <button onClick={() => setConfirmandoBulk("instalado")} style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center", marginBottom: 8, color: "var(--teal)" }}>
          <CheckCheck size={14} /> Marcar {disponivelCount} peça(s) como instalada(s)
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

          {canAgendarMedida(papel) &&
            (agendaFormTipo === "Medida" ? (
              <AgendarForm
                pedidoPreset={{ id: pedido.id, numero: pedido.numero, cliente: pedido.cliente }}
                tipoFixo="Medida"
                eventos={todosEventos}
                papel={papel}
                nome={nome}
                onCancel={() => setAgendaFormTipo(null)}
                onSaved={onCriarEvento}
                onFinalizado={() => {
                  setAgendaFormTipo(null);
                  onIrParaPedidos();
                }}
              />
            ) : (
              <button
                onClick={() => setAgendaFormTipo("Medida")}
                style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center", marginBottom: 8 }}
              >
                <CalendarPlus size={14} /> Agendar medida
              </button>
            ))}

          {canAgendarInstalacao(papel) && disponivelCount > 0 && (
            agendaFormTipo === "Instalação" ? (
              <AgendarForm
                pedidoPreset={{ id: pedido.id, numero: pedido.numero, cliente: pedido.cliente }}
                tipoFixo="Instalação"
                eventos={todosEventos}
                papel={papel}
                nome={nome}
                onCancel={() => setAgendaFormTipo(null)}
                onSaved={onCriarEvento}
                onFinalizado={() => {
                  setAgendaFormTipo(null);
                  onIrParaPedidos();
                }}
              />
            ) : (
              <button
                onClick={() => setAgendaFormTipo("Instalação")}
                style={{ ...ghostBtnStyle, width: "100%", justifyContent: "center" }}
              >
                <CalendarPlus size={14} /> Agendar instalação
              </button>
            )
          )}
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

/* ============================================================
   EDITAR INFORMAÇÕES DO PEDIDO
   ------------------------------------------------------------
   Vendedor edita nome/telefone sempre; endereço só antes da medição feita
   (ver canEditEndereco); o campo Vendedor responsável nunca é dele — só
   Gestor/Gestor Master reatribuem quem é o vendedor do pedido.
   ============================================================ */
function EditarPedidoInfo({ pedido, papel, usuarios, onChange, onCancel }) {
  const [cliente, setCliente] = useState(pedido.cliente || "");
  const [telefone, setTelefone] = useState(pedido.telefone || "");
  const [endereco, setEndereco] = useState(pedido.endereco || "");
  const [vendedor, setVendedor] = useState(pedido.vendedor || "");
  const [saving, setSaving] = useState(false);

  const podeEditarEndereco = canEditEndereco(pedido, papel);
  const podeEditarVendedor = canEditVendedorField(papel);
  const usuariosVendedores = usuarios
    .filter((u) => ["Vendedor", "Gestor", "Gestor Master"].includes(u.papel) && u.ativo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const canSalvar = cliente.trim().length > 0;

  const handleSalvar = async () => {
    if (!canSalvar || saving) return;
    setSaving(true);
    const patch = {
      cliente: cliente.trim(),
      telefone: telefone.trim(),
    };
    if (podeEditarEndereco) patch.endereco = endereco.trim();
    if (podeEditarVendedor) patch.vendedor = vendedor;
    await onChange({ ...pedido, ...patch });
    setSaving(false);
    onCancel();
  };

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Editar informações do pedido</div>

      <label style={labelStyle}>Nome do cliente</label>
      <input value={cliente} onChange={(e) => setCliente(e.target.value)} style={inputStyle()} />

      <label style={{ ...labelStyle, marginTop: 10 }}>Telefone</label>
      <input
        value={telefone}
        onChange={(e) => setTelefone(formatTelefone(e.target.value))}
        style={inputStyle()}
        inputMode="numeric"
      />

      <label style={{ ...labelStyle, marginTop: 10 }}>Endereço da obra</label>
      {podeEditarEndereco ? (
        <input value={endereco} onChange={(e) => setEndereco(e.target.value)} style={inputStyle()} />
      ) : (
        <>
          <div style={{ ...inputStyle(), background: "var(--bg)", color: "var(--ink-soft)" }}>{pedido.endereco || "—"}</div>
          <div style={{ ...missingTextStyle, color: "var(--ink-soft)" }}>
            Não dá mais para alterar o endereço depois que a medição foi feita.
          </div>
        </>
      )}

      <label style={{ ...labelStyle, marginTop: 10 }}>Vendedor responsável</label>
      {podeEditarVendedor ? (
        <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} style={inputStyle()}>
          <option value="">Selecione o vendedor…</option>
          {usuariosVendedores.map((u) => (
            <option key={u.id} value={u.nome}>
              {u.nome} ({u.papel})
            </option>
          ))}
        </select>
      ) : (
        <div
          style={{
            ...inputStyle(),
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--bg)",
            color: "var(--ink-soft)",
          }}
        >
          <RoleDot papel="Vendedor" /> {pedido.vendedor || "—"}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={{ ...ghostBtnStyle, flex: 1, justifyContent: "center" }}>
          Cancelar
        </button>
        <button
          onClick={handleSalvar}
          disabled={!canSalvar || saving}
          style={{ ...primaryBtnStyle(!canSalvar || saving), flex: 1, marginTop: 0 }}
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
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
  const [confirmando, setConfirmando] = useState(null); // "venda" | "produzir" | "disponivel" | "instalado"

  if (!peca.locked) return null; // só cortina "fechada" (medição salva) segue no fluxo de produção

  const marcarVenda = () => {
    const { iso } = nowParts();
    onUpdate({ vendaFeitaPor: nome, vendaFeitaEm: iso });
    setConfirmando(null);
  };
  const enviar = () => {
    const { iso } = nowParts();
    onUpdate({ statusProducao: "Em produção", producaoPor: nome, producaoEm: iso });
    setConfirmando(null);
  };
  const avancar = () => {
    const { iso } = nowParts();
    onUpdate({ statusProducao: "Disponível para instalar", disponivelPor: nome, disponivelEm: iso });
    setConfirmando(null);
  };
  const instalar = () => {
    const { iso } = nowParts();
    onUpdate({ statusProducao: "Instalado", instaladoPor: nome, instaladoEm: iso });
    setConfirmando(null);
  };

  const dialogs = {
    venda: {
      title: `Confirmar venda de ${peca.codigo}?`,
      message: "Isso marca a peça como fechada com o cliente. Depois disso ela fica pronta para ser enviada à produção.",
      confirmLabel: "Marcar venda feita",
      onConfirm: marcarVenda,
    },
    produzir: {
      title: `Enviar ${peca.codigo} para produção?`,
      message: "A fábrica passa a enxergar esta peça a partir de agora.",
      confirmLabel: "Enviar para produção",
      onConfirm: enviar,
    },
    disponivel: {
      title: `Marcar ${peca.codigo} como disponível para instalar?`,
      message: "O instalador passa a ver esta peça na fila dele.",
      confirmLabel: "Marcar disponível",
      onConfirm: avancar,
    },
    instalado: {
      title: `Marcar ${peca.codigo} como instalada?`,
      message: "Essa é a última etapa — depois disso a peça sai da fila de instalação.",
      confirmLabel: "Marcar instalado",
      onConfirm: instalar,
    },
  };
  const dialogo = confirmando && dialogs[confirmando];

  const confirmDialog = dialogo && (
    <ConfirmDialog
      title={dialogo.title}
      message={dialogo.message}
      confirmLabel={dialogo.confirmLabel}
      onConfirm={dialogo.onConfirm}
      onCancel={() => setConfirmando(null)}
    />
  );

  // Peça fechada (medição salva) mas ainda sem a venda confirmada: só dá
  // pra ir pra produção depois que o vendedor confirmar a venda.
  if (!peca.vendaFeitaEm) {
    if (!canEnviarProducao(papel)) return null;
    return (
      <>
        {confirmDialog}
        <button
          onClick={() => setConfirmando("venda")}
          style={{ ...smallActionStyle, marginTop: 6, color: "var(--rose)", borderColor: "var(--rose-soft)" }}
        >
          <Check size={13} /> Marcar venda feita
        </button>
      </>
    );
  }

  if (!peca.statusProducao) {
    if (!canEnviarProducao(papel)) {
      return (
        <div style={{ marginTop: 6 }}>
          <span style={statusBadgeStyle("var(--rose)")}>
            <Check size={10} /> Venda feita
          </span>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        {confirmDialog}
        <span style={statusBadgeStyle("var(--rose)")}>
          <Check size={10} /> Venda feita
        </span>
        <button
          onClick={() => setConfirmando("produzir")}
          style={{ ...smallActionStyle, color: "var(--accent)", borderColor: "var(--accent-soft)" }}
        >
          <Factory size={13} /> Enviar para produção
        </button>
      </div>
    );
  }

  if (peca.statusProducao === "Em produção") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        {confirmDialog}
        <span style={statusBadgeStyle("var(--accent)")}>
          <Factory size={10} /> Em produção
        </span>
        {canAvancarInstalar(papel) && (
          <button
            onClick={() => setConfirmando("disponivel")}
            style={{ ...smallActionStyle, color: "var(--success)", borderColor: "var(--success-soft)" }}
          >
            <Truck size={13} /> Disponível p/ instalar
          </button>
        )}
      </div>
    );
  }

  if (peca.statusProducao === "Disponível para instalar") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        {confirmDialog}
        <span style={statusBadgeStyle("var(--success)")}>
          <Truck size={10} /> Disponível para instalar
        </span>
        {canMarcarInstalado(papel) && (
          <button
            onClick={() => setConfirmando("instalado")}
            style={{ ...smallActionStyle, color: "var(--teal)", borderColor: "var(--teal-soft)" }}
          >
            <CheckCheck size={13} /> Marcar instalado
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }}>
      <span style={statusBadgeStyle("var(--teal)")}>
        <CheckCheck size={10} /> Instalado
      </span>
    </div>
  );
}

function fieldLabel(field) {
  return { largura: "Largura", altura: "Altura", alturaCurta: "Altura curta", observacoes: "Observações" }[field] || field;
}

/* ============================================================
   ORÇAMENTO DA PEÇA (Cortina) — calcula automaticamente os materiais
   e o custo a partir do trilho (Modelo), largura e do que a vendedora
   configurar aqui. Vendedor/Gestor/Gestor Master veem tudo (materiais
   + preços + resumo); Fábrica vê só as quantidades de materiais, sem
   nenhum valor em R$ — mesma regra que já protege o resto do sistema.
   ============================================================ */
function OrcCampoNumero({ label, value, onCommit, sufixo, casasDecimais = 2, placeholder }) {
  const [raw, setRaw] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setRaw(value == null ? "" : String(value));
  }, [value]);
  const commit = () => {
    const num = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    onCommit(num == null || Number.isNaN(num) ? null : Number(num.toFixed(casasDecimais)));
  };
  return (
    <label style={{ display: "block" }}>
      {label && <span style={labelStyle}>{label}</span>}
      <div style={{ position: "relative" }}>
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commit}
          inputMode="decimal"
          placeholder={placeholder || "0"}
          style={{
            ...inputStyle(),
            fontFamily: "var(--mono)",
            textAlign: "right",
            // Larga o suficiente pra caber o sufixo inteiro (ex.: "R$/m")
            // sem sobrepor o texto/placeholder digitado à direita.
            paddingRight: sufixo ? sufixo.length * 7 + 22 : undefined,
          }}
        />
        {sufixo && (
          <span
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 11,
              color: "var(--ink-soft)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {sufixo}
          </span>
        )}
      </div>
    </label>
  );
}
function OrcCamada({ chave, camada, calc, onChange, editar, fundoAtivo, fundoCosturadoJunto, onToggleFundoJunto, modeloPeca, varaoMaterial }) {
  const mesclada = !!calc?.mesclada;
  const ehVarao = modeloPeca === "Varão";
  const ehTuboVaza = modeloPeca === "Tubo Vaza";
  const fixacaoEfetivaVarao = calc?.forcarArgola ? "Argola" : camada.varaoFixacao;
  // Tipo de Argola só é uma escolha no Alumínio (no Ferro só existe PVC) e
  // só faz sentido quando a fixação efetiva dessa camada é Argola.
  const mostrarTipoArgola = ehVarao && varaoMaterial === "Alumínio" && fixacaoEfetivaVarao === "Argola";
  return (
    <div style={{ ...cardStyle, padding: "10px 12px" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: camada.ativo ? 10 : 0 }}>
        <input type="checkbox" checked={!!camada.ativo} onChange={(e) => onChange({ ativo: e.target.checked })} />
        {CAMADA_LABEL[chave]}
      </label>
      {camada.ativo && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Tecido escolhido</span>
            <input
              value={camada.tecido || ""}
              onChange={(e) => onChange({ tecido: e.target.value })}
              placeholder="Ex.: Linho cru"
              style={inputStyle()}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <OrcCampoNumero label="Preço do tecido" value={camada.precoTecido} onCommit={(v) => onChange({ precoTecido: v })} sufixo="R$/m" />
            <OrcCampoNumero label="Quantidade" value={camada.qtdTecido} onCommit={(v) => onChange({ qtdTecido: v })} sufixo="m" />
          </div>
          <OrcCampoNumero
            label="Tamanho da Barra"
            value={camada.alturaBarra}
            onCommit={(v) => onChange({ alturaBarra: v })}
            sufixo="cm"
            casasDecimais={0}
          />
          {!mesclada && (
            <>
              <label style={{ display: "block" }}>
                <span style={labelStyle}>COZ</span>
                <select value={camada.cozTipo || "Sem COZ"} onChange={(e) => onChange({ cozTipo: e.target.value })} style={inputStyle()}>
                  <option value="Sem COZ">Sem COZ</option>
                  {Object.keys(PRECO_COZ)
                    // Franzido não usa Transparente — só TNT ou Tecido.
                    // Varão também não usa Transparente, em nenhum caso.
                    .filter((t) => !(t === "Transparente" && (camada.acabamento === "Franzido" || ehVarao)))
                    .map((t) => (
                      <option key={t} value={t}>
                        {t} (R$ {PRECO_COZ[t].toFixed(2).replace(".", ",")}/m)
                      </option>
                    ))}
                </select>
              </label>
              {camada.cozTipo && camada.cozTipo !== "Sem COZ" && (
                <OrcCampoNumero label="Quantidade de COZ" value={camada.qtdCoz} onCommit={(v) => onChange({ qtdCoz: v })} sufixo="m" />
              )}
              {camada.acabamento === "Franzido" && (camada.cozTipo === "TNT" || camada.cozTipo === "Tecido") && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={!!camada.adicionarFitaFacil}
                    onChange={(e) => onChange({ adicionarFitaFacil: e.target.checked })}
                  />
                  Adicionar Fita Fácil
                </label>
              )}
            </>
          )}

          {chave === "forro" && fundoAtivo && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <input
                type="checkbox"
                checked={!!fundoCosturadoJunto}
                disabled={!editar}
                onChange={(e) => onToggleFundoJunto(e.target.checked)}
              />
              Fundo costurado junto no Forro
            </label>
          )}

          {!mesclada && ehTuboVaza && (
            <label style={{ display: "block" }}>
              <span style={labelStyle}>Diâmetro do Tubo</span>
              <select
                value={camada.tuboVazaDiametro || ""}
                onChange={(e) => onChange({ tuboVazaDiametro: e.target.value || null })}
                style={inputStyle()}
              >
                <option value="">Selecione…</option>
                {TUBO_VAZA_DIAMETROS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mesclada ? (
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontStyle: "italic" }}>
              {ehVarao
                ? "Segue a fixação do Forro (costurado junto) — sem COZ, Ilhós/Argola ou Gancho próprios."
                : "Segue o acabamento do Forro (costurado junto) — sem COZ, deslizante, clip, cordão ou fita próprios."}
            </div>
          ) : ehVarao ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: mostrarTipoArgola ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
                <label style={{ display: "block" }}>
                  <span style={labelStyle}>Diâmetro do Varão</span>
                  <select
                    value={(calc?.varaoDiametroAutomatico ? calc.varaoDiametro : camada.varaoDiametro) || ""}
                    onChange={(e) => onChange({ varaoDiametro: e.target.value || null })}
                    disabled={!!calc?.varaoDiametroAutomatico}
                    style={inputStyle()}
                  >
                    <option value="">Selecione…</option>
                    {diametrosVaraoDisponiveis(varaoMaterial).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  {calc?.varaoDiametroAutomatico && (
                    <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                      Determinado automaticamente pelo Suporte {calc.varaoDiametro} escolhido pra peça.
                    </span>
                  )}
                </label>
                {!calc?.forcarArgola && (
                  <label style={{ display: "block" }}>
                    <span style={labelStyle}>Fixação</span>
                    <select
                      value={camada.varaoFixacao || ""}
                      onChange={(e) => onChange({ varaoFixacao: e.target.value || null })}
                      style={inputStyle()}
                    >
                      <option value="">Selecione…</option>
                      {TIPOS_FIXACAO_VARAO.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {mostrarTipoArgola && (
                  <label style={{ display: "block" }}>
                    <span style={labelStyle}>Tipo de Argola</span>
                    <select
                      value={camada.argolaTipo || ""}
                      onChange={(e) => onChange({ argolaTipo: e.target.value || null })}
                      style={inputStyle()}
                    >
                      <option value="">Selecione…</option>
                      {TIPOS_ARGOLA_ALUMINIO.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {calc?.forcarArgola && (
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontStyle: "italic" }}>
                  Fixação: Argola (obrigatório) — só a camada mais à frente pode ser Ilhós.
                </div>
              )}
              <div style={{ display: "flex", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={!!camada.flangeEsquerda}
                    onChange={(e) => onChange({ flangeEsquerda: e.target.checked })}
                  />
                  Flange na ponta esquerda
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={!!camada.flangeDireita}
                    onChange={(e) => onChange({ flangeDireita: e.target.checked })}
                  />
                  Flange na ponta direita
                </label>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                Ponta sem Flange própria depende do Suporte compartilhado da peça e soma 1 Ponteira {calc?.varaoDiametro || ""}.
              </div>
            </>
          ) : calc?.forcarFranzido ? (
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontStyle: "italic" }}>
              Acabamento: Franzido (obrigatório) — só a camada mais à frente pode ser Wave.
            </div>
          ) : (
            <>
              <label style={{ display: "block" }}>
                <span style={labelStyle}>Acabamento</span>
                <select value={camada.acabamento || ""} onChange={(e) => onChange({ acabamento: e.target.value || null })} style={inputStyle()}>
                  <option value="">Selecione…</option>
                  {ACABAMENTOS_CORTINA.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              {camada.acabamento === "Wave" && (
                <label style={{ display: "block" }}>
                  <span style={labelStyle}>Espaçamento cordão Wave</span>
                  <select
                    value={camada.espacamentoCordao || ""}
                    onChange={(e) => onChange({ espacamentoCordao: e.target.value || null })}
                    style={inputStyle()}
                  >
                    <option value="">Selecione…</option>
                    {ESPACAMENTOS_CORDAO_WAVE.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          {calc && (calc.deslizantes || calc.clips || calc.cordao || calc.fitaWave) && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {calc.deslizantes && (
                <OrcMaterialRow
                  nome="Deslizantes"
                  quantidadeTexto={String(calc.deslizantes.quantidade)}
                  valorUnitario={calc.deslizantes.valorUnitario}
                  total={calc.deslizantes.total}
                  mostrarValores={editar}
                />
              )}
              {calc.clips && (
                <OrcMaterialRow
                  nome="Clips"
                  quantidadeTexto={String(calc.clips.quantidade)}
                  valorUnitario={calc.clips.valorUnitario}
                  total={calc.clips.total}
                  mostrarValores={editar}
                />
              )}
              {calc.cordao && (
                <OrcMaterialRow
                  nome="Cordão"
                  quantidadeTexto={calc.cordao.metros.toFixed(2) + " m"}
                  valorUnitario={calc.cordao.valorUnitario}
                  total={calc.cordao.total}
                  mostrarValores={editar}
                />
              )}
              {calc.fitaWave && (
                <OrcMaterialRow
                  nome="Fita Fácil"
                  quantidadeTexto={calc.fitaWave.metros.toFixed(2) + " m"}
                  valorUnitario={calc.fitaWave.valorUnitario}
                  total={calc.fitaWave.total}
                  mostrarValores={editar}
                />
              )}
            </div>
          )}

          {calc?.varaoBarra && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <OrcMaterialRow
                nome={`Varão — ${calc.varaoBarra.diametro} · ${calc.varaoBarra.material} ${calc.varaoBarra.cor}`}
                detalhe={calc.varaoBarra.precoDefinido ? `Real ${calc.varaoBarra.larguraReal.toFixed(2)} m` : "Preço a definir"}
                quantidadeTexto={calc.varaoBarra.larguraCobrada.toFixed(2) + " m"}
                valorUnitario={calc.varaoBarra.valorUnitario}
                total={calc.varaoBarra.total}
                mostrarValores={editar}
              />
            </div>
          )}

          {calc?.flange && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <OrcMaterialRow
                nome={`Flange${calc.varaoDiametro ? " " + calc.varaoDiametro : ""}`}
                detalhe={calc.flange.precoDefinido ? undefined : "Preço a definir"}
                quantidadeTexto={String(calc.flange.quantidade)}
                valorUnitario={calc.flange.valorUnitario}
                total={calc.flange.total}
                mostrarValores={editar}
              />
            </div>
          )}

          {calc?.tuboVazaBarra && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <OrcMaterialRow
                nome={`Tubo Vaza — ${calc.tuboVazaBarra.diametro} · ${calc.tuboVazaBarra.cor}`}
                detalhe={calc.tuboVazaBarra.precoDefinido ? `Real ${calc.tuboVazaBarra.larguraReal.toFixed(2)} m` : "Preço a definir"}
                quantidadeTexto={calc.tuboVazaBarra.larguraCobrada.toFixed(2) + " m"}
                valorUnitario={calc.tuboVazaBarra.valorUnitario}
                total={calc.tuboVazaBarra.total}
                mostrarValores={editar}
              />
            </div>
          )}

          {calc && (calc.ilhosOuArgolas || calc.ganchos) && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {calc.ilhosOuArgolas && (
                <OrcMaterialRow
                  nome={
                    calc.ilhosOuArgolas.tipo === "Argola"
                      ? "Argolas" + (calc.ilhosOuArgolas.argolaTipo ? " " + calc.ilhosOuArgolas.argolaTipo : "")
                      : "Ilhós"
                  }
                  detalhe={calc.ilhosOuArgolas.precoDefinido ? undefined : "Preço a definir"}
                  quantidadeTexto={String(calc.ilhosOuArgolas.quantidade)}
                  valorUnitario={calc.ilhosOuArgolas.valorUnitario}
                  total={calc.ilhosOuArgolas.total}
                  mostrarValores={editar}
                />
              )}
              {calc.ganchos && (
                <OrcMaterialRow
                  nome="Ganchos"
                  detalhe={calc.ganchos.precoDefinido ? undefined : "Preço a definir"}
                  quantidadeTexto={String(calc.ganchos.quantidade)}
                  valorUnitario={calc.ganchos.valorUnitario}
                  total={calc.ganchos.total}
                  mostrarValores={editar}
                />
              )}
            </div>
          )}

          {calc && (
            <div style={{ fontSize: 12, color: "var(--ink-soft)", textAlign: "right", borderTop: "1px solid var(--line)", paddingTop: 6 }}>
              Custo da camada: <strong style={{ color: "var(--ink)" }}>{fmtValor(calc.custoTotal)}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function OrcMaterialRow({ nome, detalhe, quantidadeTexto, valorUnitario, total, mostrarValores }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nome}</div>
        {detalhe && <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{detalhe}</div>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 12.5, fontFamily: "var(--mono)" }}>{quantidadeTexto}</div>
        {mostrarValores && valorUnitario != null && (
          <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
            {fmtValor(valorUnitario)} un. · <strong style={{ color: "var(--ink)" }}>{fmtValor(total || 0)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   CARACTERÍSTICAS DA PRODUÇÃO — leitura direta pra fábrica, sem
   precisar abrir o formulário de Orçamento (que é editar-only pra
   Vendedor/Gestor). Mostra por camada exatamente o que a fábrica
   precisa: tecido, modelo (com acabamento, pro desconto de medida
   correto), tipo de COZ, clips, deslizantes, cordão e tamanho da
   barra — além da largura x altura da peça e observações de costura.
   ============================================================ */
function CaracteristicasProducao({ peca, orc, calc }) {
  if (!calc.usaOrcamento) return null;
  const camadasAtivas = CAMADAS_CORTINA.filter((chave) => calc.camadas[chave]?.ativo);
  if (camadasAtivas.length === 0) return null;

  const corPeca =
    peca.modelo === "Trilho suíço"
      ? orc.trilhoCor
      : peca.modelo === "Varão"
      ? [orc.varaoMaterial, orc.varaoCor].filter(Boolean).join(" ") || null
      : peca.modelo === "Tubo Vaza"
      ? orc.tuboVazaCor
      : null;

  const aberturaLabel = ABERTURAS_CORTINA.find((a) => a.chave === orc.abertura)?.label || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={cardStyle}>
        <InfoRow label="Largura x Altura" value={`${fmtMedida(peca.largura) || "—"} x ${fmtMedida(peca.altura) || "—"}`} mono />
        {corPeca && <InfoRow label="Cor" value={corPeca} />}
        <InfoRow label="Abertura" value={aberturaLabel || "—"} />
      </div>
      {camadasAtivas.map((chave) => {
        const cc = calc.camadas[chave];
        const ehVarao = peca.modelo === "Varão";
        const ehTuboVaza = peca.modelo === "Tubo Vaza";
        const acabamentoEfetivo = cc.mesclada ? null : cc.forcarFranzido ? "Franzido" : cc.acabamento;
        // No Varão, cc.ilhosOuArgolas.tipo já reflete a fixação EFETIVA
        // (força Argola quando a frente é Ilhós) — usa ela, não a bruta.
        const fixacaoEfetiva = cc.ilhosOuArgolas?.tipo || cc.varaoFixacao;
        const modeloLabel = ehVarao
          ? cc.mesclada
            ? null
            : labelModeloVarao(fixacaoEfetiva, cc.varaoDiametro)
          : acabamentoEfetivo
          ? labelModeloCamada(peca.modelo, acabamentoEfetivo, cc.tuboVazaDiametro)
          : null;
        const cozLabel =
          !cc.mesclada && cc.cozTipo && cc.cozTipo !== "Sem COZ" ? labelTipoCoz(cc.cozTipo, !ehVarao && !!cc.fitaWave) : null;
        const clipsQtd = cc.clips?.quantidade || 0;
        const deslizantesQtd = cc.deslizantes?.quantidade ?? null;
        const ilhosArgolasQtd = cc.ilhosOuArgolas?.quantidade ?? null;
        const ganchosQtd = cc.ganchos?.quantidade ?? null;
        return (
          <div key={chave} style={{ ...cardStyle, padding: "10px 12px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{CAMADA_LABEL[chave]}</div>
            <InfoRow label="Tecido" value={cc.tecido || "—"} />
            {cc.mesclada ? (
              <>
                {/* Só a parte de cima é costurada junto — a barra do Fundo
                    continua independente e precisa vir informada. */}
                <InfoRow label="Tamanho da Barra" value={cc.alturaBarra != null ? `${cc.alturaBarra} cm` : "—"} />
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontStyle: "italic", paddingTop: 6 }}>
                  {ehVarao
                    ? "Costurado junto no Forro (só a parte de cima) — segue o modelo do Forro, sem COZ, Ilhós/Argola ou Gancho próprios."
                    : "Costurado junto no Forro (só a parte de cima) — segue o modelo do Forro, sem COZ, clips, deslizantes ou cordão próprios."}
                </div>
              </>
            ) : ehVarao ? (
              <>
                <InfoRow label="Modelo" value={modeloLabel || "—"} mono />
                {cozLabel && <InfoRow label="Tipo de COZ" value={cozLabel} />}
                <InfoRow
                  label="Tamanho do Varão"
                  value={cc.varaoBarra ? `${cc.varaoBarra.larguraCobrada.toFixed(2)} m` : "—"}
                  mono
                />
                <InfoRow
                  label={
                    fixacaoEfetiva === "Argola"
                      ? "Número de Argolas" + (cc.ilhosOuArgolas?.argolaTipo ? ` (${cc.ilhosOuArgolas.argolaTipo})` : "")
                      : "Número de Ilhós"
                  }
                  value={ilhosArgolasQtd != null ? String(ilhosArgolasQtd) : "—"}
                />
                {fixacaoEfetiva === "Argola" && (
                  <InfoRow label="Número de Ganchos" value={ganchosQtd != null ? String(ganchosQtd) : "—"} />
                )}
                {cc.flange && <InfoRow label="Flange" value={`${cc.flange.quantidade} un`} />}
                <InfoRow label="Tamanho da Barra" value={cc.alturaBarra != null ? `${cc.alturaBarra} cm` : "—"} />
              </>
            ) : (
              <>
                <InfoRow label="Modelo" value={modeloLabel || "—"} mono />
                {cozLabel && <InfoRow label="Tipo de COZ" value={cozLabel} />}
                {ehTuboVaza && (
                  <InfoRow label="Tamanho do Tubo" value={cc.tuboVazaBarra ? `${cc.tuboVazaBarra.larguraCobrada.toFixed(2)} m` : "—"} mono />
                )}
                <InfoRow label="Número de Clips" value={clipsQtd > 0 ? String(clipsQtd) : "Não colocar Clips"} />
                <InfoRow
                  label="Número de Deslizantes"
                  value={deslizantesQtd != null ? (deslizantesQtd > 0 ? String(deslizantesQtd) : "⚠ 0 — verificar medida") : "—"}
                />
                {deslizantesQtd != null && <InfoRow label="Cordão" value={String(deslizantesQtd)} />}
                <InfoRow label="Tamanho da Barra" value={cc.alturaBarra != null ? `${cc.alturaBarra} cm` : "—"} />
              </>
            )}
          </div>
        );
      })}
      {(orc.fundoCosturadoJunto && orc.camadas?.forro?.ativo) || (orc.observacaoCostura && orc.observacaoCostura.trim()) ? (
        <div style={{ fontSize: 12, color: "var(--ink-soft)", whiteSpace: "pre-wrap" }}>
          <strong>Observações:</strong>
          {orc.fundoCosturadoJunto && orc.camadas?.forro?.ativo && (
            <div>Fundo costurado junto ao Forro — tecidos na mesma sacola (Fundo e Forro).</div>
          )}
          {orc.observacaoCostura && orc.observacaoCostura.trim() && <div>{orc.observacaoCostura}</div>}
        </div>
      ) : null}
    </div>
  );
}

// Escapa texto do usuário antes de injetar como HTML na janela de impressão.
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Monta o HTML autocontido da Ficha de Produção pra impressão — mesma
// informação do CaracteristicasProducao, mas como documento simples
// (sem depender do app aberto), com Cliente/Ambiente/Peça no topo e as
// observações com espaço livre pra crescer (sem corte de altura).
function gerarHtmlFichaProducao(pedido, ambiente, peca, orc, calc) {
  const camadasAtivas = CAMADAS_CORTINA.filter((chave) => calc.camadas[chave]?.ativo);

  const camadasHtml = camadasAtivas
    .map((chave) => {
      const cc = calc.camadas[chave];
      const ehVarao = peca.modelo === "Varão";
      const ehTuboVaza = peca.modelo === "Tubo Vaza";
      const acabamentoEfetivo = cc.mesclada ? null : cc.forcarFranzido ? "Franzido" : cc.acabamento;
      // No Varão, cc.ilhosOuArgolas.tipo já reflete a fixação EFETIVA
      // (força Argola quando a frente é Ilhós) — usa ela, não a bruta.
      const fixacaoEfetiva = cc.ilhosOuArgolas?.tipo || cc.varaoFixacao;
      const modeloLabel = ehVarao
        ? cc.mesclada
          ? null
          : labelModeloVarao(fixacaoEfetiva, cc.varaoDiametro)
        : acabamentoEfetivo
        ? labelModeloCamada(peca.modelo, acabamentoEfetivo, cc.tuboVazaDiametro)
        : null;
      const cozLabel =
        !cc.mesclada && cc.cozTipo && cc.cozTipo !== "Sem COZ" ? labelTipoCoz(cc.cozTipo, !ehVarao && !!cc.fitaWave) : null;
      const clipsQtd = cc.clips?.quantidade || 0;
      const deslizantesQtd = cc.deslizantes?.quantidade ?? null;
      const ilhosArgolasQtd = cc.ilhosOuArgolas?.quantidade ?? null;
      const ganchosQtd = cc.ganchos?.quantidade ?? null;

      const linhas = [["Tecido", escapeHtml(cc.tecido || "—")]];
      if (cc.mesclada) {
        linhas.push(["Tamanho da Barra", cc.alturaBarra != null ? `${cc.alturaBarra} cm` : "—"]);
      } else if (ehVarao) {
        linhas.push(["Modelo", escapeHtml(modeloLabel || "—")]);
        if (cozLabel) linhas.push(["Tipo de COZ", escapeHtml(cozLabel)]);
        linhas.push(["Tamanho do Varão", cc.varaoBarra ? `${cc.varaoBarra.larguraCobrada.toFixed(2)} m` : "—"]);
        linhas.push([
          fixacaoEfetiva === "Argola"
            ? "Número de Argolas" + (cc.ilhosOuArgolas?.argolaTipo ? ` (${escapeHtml(cc.ilhosOuArgolas.argolaTipo)})` : "")
            : "Número de Ilhós",
          ilhosArgolasQtd != null ? String(ilhosArgolasQtd) : "—",
        ]);
        if (fixacaoEfetiva === "Argola") linhas.push(["Número de Ganchos", ganchosQtd != null ? String(ganchosQtd) : "—"]);
        if (cc.flange) linhas.push(["Flange", `${cc.flange.quantidade} un`]);
        linhas.push(["Tamanho da Barra", cc.alturaBarra != null ? `${cc.alturaBarra} cm` : "—"]);
      } else {
        linhas.push(["Modelo", escapeHtml(modeloLabel || "—")]);
        if (cozLabel) linhas.push(["Tipo de COZ", escapeHtml(cozLabel)]);
        if (ehTuboVaza) {
          linhas.push(["Tamanho do Tubo", cc.tuboVazaBarra ? `${cc.tuboVazaBarra.larguraCobrada.toFixed(2)} m` : "—"]);
        }
        linhas.push(["Número de Clips", clipsQtd > 0 ? String(clipsQtd) : "Não colocar Clips"]);
        linhas.push([
          "Número de Deslizantes",
          deslizantesQtd != null ? (deslizantesQtd > 0 ? String(deslizantesQtd) : "0 — verificar medida") : "—",
        ]);
        if (deslizantesQtd != null) linhas.push(["Cordão", String(deslizantesQtd)]);
        linhas.push(["Tamanho da Barra", cc.alturaBarra != null ? `${cc.alturaBarra} cm` : "—"]);
      }
      const linhasHtml = linhas
        .map(([l, v]) => `<div class="row"><span class="label">${l}</span><span class="value">${v}</span></div>`)
        .join("");
      const nota = cc.mesclada
        ? `<div class="nota">Costurado junto no Forro (só a parte de cima) — segue o modelo do Forro, sem COZ, ${
            ehVarao ? "Ilhós/Argola ou Gancho" : "clips, deslizantes ou cordão"
          } próprios.</div>`
        : "";
      return `<div class="camada"><h3>${escapeHtml(CAMADA_LABEL[chave])}</h3>${linhasHtml}${nota}</div>`;
    })
    .join("");

  const observacoes = [];
  if (orc.fundoCosturadoJunto && orc.camadas?.forro?.ativo) {
    observacoes.push("Fundo costurado junto ao Forro — tecidos na mesma sacola (Fundo e Forro).");
  }
  if (orc.observacaoCostura && orc.observacaoCostura.trim()) observacoes.push(orc.observacaoCostura.trim());
  const observacoesHtml =
    observacoes.length > 0
      ? `<div class="obs"><strong>Observações</strong><br>${observacoes.map(escapeHtml).join("<br><br>")}</div>`
      : "";

  const corPeca =
    peca.modelo === "Trilho suíço"
      ? orc.trilhoCor
      : peca.modelo === "Varão"
      ? [orc.varaoMaterial, orc.varaoCor].filter(Boolean).join(" ") || null
      : peca.modelo === "Tubo Vaza"
      ? orc.tuboVazaCor
      : null;
  const corHtml = corPeca ? `<div class="row"><span class="label">Cor</span><span class="value">${escapeHtml(corPeca)}</span></div>` : "";
  const aberturaLabel = ABERTURAS_CORTINA.find((a) => a.chave === orc.abertura)?.label || null;
  const aberturaHtml = aberturaLabel
    ? `<div class="row"><span class="label">Abertura</span><span class="value">${escapeHtml(aberturaLabel)}</span></div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Ficha de Produção — ${escapeHtml(peca.codigo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 28px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { font-size: 12px; color: #666; margin-bottom: 18px; }
  .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e2e2e2; font-size: 13px; }
  .row .label { color: #666; }
  .row .value { font-weight: 600; text-align: right; max-width: 60%; }
  .identificacao { margin-bottom: 18px; }
  .camada { border: 1px solid #ccc; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; break-inside: avoid; }
  .camada h3 { font-size: 14px; margin: 0 0 6px; }
  .nota { font-size: 11.5px; color: #666; font-style: italic; padding-top: 6px; }
  .obs { font-size: 12.5px; white-space: pre-wrap; border: 1px dashed #bbb; border-radius: 8px; padding: 12px 14px; margin-top: 16px; line-height: 1.5; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
  <h1>Ficha de Produção</h1>
  <div class="sub">${escapeHtml(peca.codigo)}</div>
  <div class="identificacao">
    <div class="row"><span class="label">Cliente</span><span class="value">${escapeHtml(pedido.cliente)}</span></div>
    <div class="row"><span class="label">Ambiente</span><span class="value">${escapeHtml(ambiente.nome)}</span></div>
    <div class="row"><span class="label">Peça</span><span class="value">${escapeHtml(peca.tipo)}</span></div>
    <div class="row"><span class="label">Largura x Altura</span><span class="value">${escapeHtml(fmtMedida(peca.largura) || "—")} x ${escapeHtml(fmtMedida(peca.altura) || "—")}</span></div>
    ${corHtml}
    ${aberturaHtml}
  </div>
  ${camadasHtml}
  ${observacoesHtml}
</body>
</html>`;
}
// Ícone simples da Abertura: N barras verticais lado a lado, uma por
// folha — comunica visualmente quantas folhas aquela opção representa
// (1 pra Inteira, 2 pra Aberta ao Meio etc.), sem depender de nenhuma
// biblioteca de ícones externa.
function AberturaIcone({ folhas }) {
  const largura = 28;
  const altura = 20;
  const gap = 2;
  const larguraFolha = (largura - gap * (folhas - 1)) / folhas;
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true">
      {Array.from({ length: folhas }).map((_, i) => (
        <rect key={i} x={i * (larguraFolha + gap)} y={0} width={larguraFolha} height={altura} rx={1.5} fill="currentColor" opacity={0.85} />
      ))}
    </svg>
  );
}
function FichaOrcamento({ peca, papel, onUpdateOrcamento }) {
  const orc = peca.orcamento || orcamentoPadrao();
  const calc = calcularOrcamentoPeca(peca);
  const editar = canEditarOrcamento(papel);
  const verMateriais = canVerMateriaisProducao(papel);

  // Só a camada mais à frente pode ser Wave — se outra ficou marcada Wave
  // antes de uma camada da frente virar Wave (ou de o Xale ser ativado),
  // corrige sozinho pra Franzido, seguindo calc.camadas[].forcarFranzido.
  // Junto, corrige também COZ Transparente em camada Franzido — Franzido
  // não usa Transparente, só TNT ou Tecido.
  useEffect(() => {
    if (!calc.usaOrcamento) return;
    const ehVarao = peca.modelo === "Varão";
    const patch = {};
    CAMADAS_CORTINA.forEach((chave) => {
      const cc = calc.camadas[chave];
      const atual = orc.camadas?.[chave];
      if (!atual) return;
      const forcarFranzido = ORDEM_FRENTE_CAMADAS.includes(chave) && cc?.forcarFranzido;
      const acabamentoEfetivo = forcarFranzido ? "Franzido" : atual.acabamento;
      let ajuste = null;
      if (forcarFranzido && atual.acabamento !== "Franzido") {
        ajuste = { ...(ajuste || atual), acabamento: "Franzido", espacamentoCordao: null };
      }
      // Franzido e Varão nunca usam COZ Transparente — só TNT ou Tecido.
      if ((acabamentoEfetivo === "Franzido" || ehVarao) && atual.cozTipo === "Transparente") {
        ajuste = { ...(ajuste || atual), cozTipo: "TNT" };
      }
      // Varão: só a camada mais à frente pode ser Ilhós — se outra ficou
      // marcada Ilhós antes de a frente virar Ilhós (ou de o Xale ser
      // ativado), corrige sozinho pra Argola, seguindo calc.camadas[].forcarArgola.
      const forcarArgola = ehVarao && ORDEM_FRENTE_CAMADAS.includes(chave) && cc?.forcarArgola;
      if (forcarArgola && atual.varaoFixacao !== "Argola") {
        ajuste = { ...(ajuste || atual), varaoFixacao: "Argola" };
      }
      if (ajuste) patch[chave] = ajuste;
    });
    if (Object.keys(patch).length > 0) {
      onUpdateOrcamento({ camadas: { ...orc.camadas, ...patch } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc.usaOrcamento, JSON.stringify(calc.camadas), JSON.stringify(orc.camadas)]);

  if (!verMateriais) return null;

  if (!calc.usaOrcamento) {
    return (
      <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
        {MODELOS_COM_ORCAMENTO.includes(peca.modelo)
          ? "Selecione o tipo de trilho em \"Modelo\" acima para calcular o orçamento automaticamente."
          : "Este modelo ainda não tem orçamento automático configurado. O valor da peça segue manual."}
      </div>
    );
  }

  const setCamada = (chave, patch) => onUpdateOrcamento({ camadas: { ...orc.camadas, [chave]: { ...orc.camadas[chave], ...patch } } });
  const addSuporte = () =>
    onUpdateOrcamento({
      suportes: [...(orc.suportes || []), { id: uid(), tipo: Object.keys(catalogoSuporte(peca.modelo, orc))[0], qtd: null }],
    });
  const setSuporte = (id, patch) => onUpdateOrcamento({ suportes: (orc.suportes || []).map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const removeSuporte = (id) => onUpdateOrcamento({ suportes: (orc.suportes || []).filter((s) => s.id !== id) });
  const setMaoDeObra = (patch) =>
    onUpdateOrcamento({ maoDeObra: { ...(orc.maoDeObra || { fabricacao: null, instalacao: null }), ...patch } });
  const setPrecoPonteira = (diametro, valor) =>
    onUpdateOrcamento({ precoPonteiraPorDiametro: { ...(orc.precoPonteiraPorDiametro || {}), [diametro]: valor } });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {peca.modelo === "Trilho suíço" && editar && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Tipo de Trilho</span>
            <select
              value={orc.tipoTrilho || ""}
              onChange={(e) => onUpdateOrcamento({ tipoTrilho: e.target.value || null })}
              style={inputStyle()}
            >
              <option value="">Selecione…</option>
              {tiposTrilhoDisponiveis(orc.trilhoCor).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Cor</span>
            <select
              value={orc.trilhoCor || ""}
              onChange={(e) => {
                const novaCor = e.target.value || null;
                const tipoAindaValido = tiposTrilhoDisponiveis(novaCor).includes(orc.tipoTrilho);
                onUpdateOrcamento({ trilhoCor: novaCor, tipoTrilho: tipoAindaValido ? orc.tipoTrilho : null });
              }}
              style={inputStyle()}
            >
              <option value="">Selecione…</option>
              {TRILHO_CORES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {peca.modelo === "Trilho suíço" && orc.trilhoCor === "Preto" && (
        <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontStyle: "italic" }}>
          Na cor Preto só existe Trilho simples extra — não tem duplo ou triplo nessa cor.
        </div>
      )}

      {peca.modelo === "Varão" && editar && (
        <div style={{ display: "grid", gridTemplateColumns: orc.varaoMaterial === "Alumínio" ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Material</span>
            <select
              value={orc.varaoMaterial || ""}
              onChange={(e) => {
                const novoMaterial = e.target.value || null;
                const corAindaValida = coresVaraoDisponiveis(novoMaterial).includes(orc.varaoCor);
                onUpdateOrcamento({
                  varaoMaterial: novoMaterial,
                  varaoCor: corAindaValida ? orc.varaoCor : null,
                  varaoTipoSuporte: novoMaterial === "Alumínio" ? orc.varaoTipoSuporte || "PVC" : null,
                });
              }}
              style={inputStyle()}
            >
              <option value="">Selecione…</option>
              {VARAO_MATERIAIS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Cor</span>
            <select
              value={orc.varaoCor || ""}
              disabled={!orc.varaoMaterial}
              onChange={(e) => onUpdateOrcamento({ varaoCor: e.target.value || null })}
              style={inputStyle()}
            >
              <option value="">Selecione…</option>
              {coresVaraoDisponiveis(orc.varaoMaterial).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {orc.varaoMaterial === "Alumínio" && (
            <label style={{ display: "block" }}>
              <span style={labelStyle}>Tipo de Suporte</span>
              <select
                value={orc.varaoTipoSuporte || "PVC"}
                onChange={(e) => onUpdateOrcamento({ varaoTipoSuporte: e.target.value || "PVC" })}
                style={inputStyle()}
              >
                <option value="PVC">PVC</option>
                <option value="Metal">Metal</option>
              </select>
            </label>
          )}
        </div>
      )}

      {peca.modelo === "Tubo Vaza" && editar && (
        <label style={{ display: "block" }}>
          <span style={labelStyle}>Cor</span>
          <select
            value={orc.tuboVazaCor || ""}
            onChange={(e) => onUpdateOrcamento({ tuboVazaCor: e.target.value || null })}
            style={inputStyle()}
          >
            <option value="">Selecione…</option>
            {TUBO_VAZA_CORES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
      {peca.modelo === "Tubo Vaza" && calc.resumo.incompleto && (
        <div style={{ fontSize: 11.5, color: "var(--amber)" }}>
          Preço ainda não cadastrado para algum diâmetro/cor de Tubo Vaza usado nas camadas — total ainda não reflete essa peça.
        </div>
      )}
      {peca.modelo === "Varão" && calc.resumo.incompleto && (
        <div style={{ fontSize: 11.5, color: "var(--amber)" }}>
          Algum preço do Varão (haste, Ilhós, Argola, Gancho, Flange, Ponteira ou Suporte) ainda não foi cadastrado — total ainda não
          reflete essa peça.
        </div>
      )}

      {editar ? (
        <label style={{ display: "block" }}>
          <span style={labelStyle}>Abertura</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {ABERTURAS_CORTINA.map((a) => {
              const selecionada = orc.abertura === a.chave;
              return (
                <button
                  key={a.chave}
                  type="button"
                  onClick={() => onUpdateOrcamento({ abertura: a.chave })}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: "8px 4px",
                    borderRadius: 8,
                    border: selecionada ? "2px solid var(--accent)" : "1px solid var(--line)",
                    background: selecionada ? "var(--accent-soft)" : "transparent",
                    color: selecionada ? "var(--accent-ink)" : "var(--ink)",
                    cursor: "pointer",
                    fontSize: 11,
                    textAlign: "center",
                  }}
                >
                  <AberturaIcone folhas={a.folhas} />
                  {a.label}
                </button>
              );
            })}
          </div>
        </label>
      ) : (
        orc.abertura && (
          <div style={{ fontSize: 12.5 }}>
            <span style={{ color: "var(--ink-soft)" }}>Abertura: </span>
            {ABERTURAS_CORTINA.find((a) => a.chave === orc.abertura)?.label || orc.abertura}
          </div>
        )
      )}
      {calc.resumo.aberturaIncompleta && (
        <div style={{ fontSize: 11.5, color: "var(--amber)" }}>
          Selecione a Abertura da cortina acima — Deslizante/Clip/Cordão (Wave/Franzido) ou Ilhós/Argola/Gancho (Varão) dependem
          dela pra calcular.
        </div>
      )}

      {editar && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
            Camadas{" "}
            <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>
              {peca.modelo === "Varão"
                ? "— diâmetro e fixação (Ilhós/Argola) são por camada"
                : peca.modelo === "Tubo Vaza"
                ? "— diâmetro é por camada; acabamento (Wave/Franzido) também é por camada"
                : "— acabamento (Wave/Franzido) é por camada"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {CAMADAS_CORTINA.map((chave) => (
              <OrcCamada
                key={chave}
                chave={chave}
                camada={orc.camadas?.[chave] || camadaOrcamentoPadrao()}
                calc={calc.camadas[chave]}
                onChange={(patch) => setCamada(chave, patch)}
                editar={editar}
                fundoAtivo={!!orc.camadas?.fundo?.ativo}
                fundoCosturadoJunto={!!orc.fundoCosturadoJunto}
                onToggleFundoJunto={(v) => onUpdateOrcamento({ fundoCosturadoJunto: v })}
                modeloPeca={peca.modelo}
                varaoMaterial={orc.varaoMaterial}
              />
            ))}
          </div>
        </div>
      )}

      {editar && (
        <label style={{ display: "block" }}>
          <span style={labelStyle}>Observação de costura (outros casos)</span>
          <textarea
            value={orc.observacaoCostura || ""}
            onChange={(e) => onUpdateOrcamento({ observacaoCostura: e.target.value })}
            placeholder="Ex.: xale costurado junto no forro"
            rows={2}
            style={{ ...inputStyle(), resize: "vertical" }}
          />
        </label>
      )}

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Estrutura</div>
        <div>
          {calc.trilho && (
            <OrcMaterialRow
              nome={"Trilho — " + calc.trilho.tipo}
              detalhe={`Real ${calc.trilho.larguraReal.toFixed(2)} m`}
              quantidadeTexto={calc.trilho.larguraCobrada.toFixed(2) + " m"}
              valorUnitario={calc.trilho.valorUnitario}
              total={calc.trilho.total}
              mostrarValores={editar}
            />
          )}
          {calc.presilhas && (
            <OrcMaterialRow
              nome={"Presilhas — " + calc.presilhas.tipo}
              detalhe="Calculado automaticamente"
              quantidadeTexto={String(calc.presilhas.quantidade ?? "—")}
              valorUnitario={calc.presilhas.valorUnitario}
              total={calc.presilhas.total}
              mostrarValores={editar}
            />
          )}
          <div style={{ fontSize: 11, color: "var(--ink-soft)", paddingTop: 6 }}>
            {peca.modelo === "Varão"
              ? "Varão (haste), Ilhós, Argola, Gancho e Flange aparecem dentro de cada camada, acima."
              : peca.modelo === "Tubo Vaza"
              ? "Tubo Vaza (diâmetro), deslizante, clip, cordão e fita Wave aparecem dentro de cada camada, acima."
              : "Deslizante, clip, cordão e fita Wave aparecem dentro de cada camada, acima."}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>
            Suportes
            {peca.modelo === "Varão" && (
              <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>
                {" "}
                — compartilhados entre varões; ponta com Flange própria não precisa de suporte
              </span>
            )}
            {peca.modelo === "Tubo Vaza" && (
              <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}> — mínimo {SUPORTES_MINIMOS_TUBO_VAZA} no Tubo Vaza</span>
            )}
          </div>
          {editar && (
            <button onClick={addSuporte} style={{ ...ghostBtnStyle, width: "auto", padding: "4px 8px", fontSize: 12 }}>
              <Plus size={13} /> Adicionar
            </button>
          )}
        </div>
        {calc.resumo.suportesInsuficientes && (
          <div style={{ fontSize: 11.5, color: "var(--amber)", marginBottom: 8 }}>
            {peca.modelo === "Varão"
              ? "Pelo menos um suporte compartilhado é necessário — cobrindo as pontas sem flange própria — ou marque flange nas duas pontas de cada varão."
              : `${peca.modelo} sempre precisa de pelo menos ${SUPORTES_MINIMOS_TUBO_VAZA} suportes — adicione acima.`}
          </div>
        )}
        {(orc.suportes || []).length === 0 ? (
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Nenhum suporte adicionado.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {calc.suportes.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={s.tipo}
                  disabled={!editar}
                  onChange={(e) => setSuporte(s.id, { tipo: e.target.value })}
                  style={{ ...inputStyle(), flex: 1 }}
                >
                  {Object.keys(catalogoSuporte(peca.modelo, orc)).map((t) => (
                    <option key={t} value={t}>
                      Suporte {t}
                    </option>
                  ))}
                </select>
                <div style={{ width: 70 }}>
                  <OrcCampoNumero value={s.qtd} onCommit={(v) => setSuporte(s.id, { qtd: v })} casasDecimais={0} />
                </div>
                {editar && (
                  <div style={{ fontSize: 11.5, color: s.precoDefinido ? "var(--ink-soft)" : "var(--amber)", width: 80, textAlign: "right" }}>
                    {s.precoDefinido ? fmtValor(s.total) : "a definir"}
                  </div>
                )}
                {editar && (
                  <button onClick={() => removeSuporte(s.id)} style={{ background: "none", border: "none", padding: 4, color: "var(--locked)" }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {peca.modelo === "Varão" && Object.keys(calc.ponteiras.porDiametro).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
              Ponteira <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>— preço manual por diâmetro (não tem tabela)</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.keys(calc.ponteiras.porDiametro).map((d) => (
                <div key={d} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, fontSize: 12.5 }}>
                    Ponteira {d} <span style={{ color: "var(--ink-soft)" }}>— {calc.ponteiras.porDiametro[d]} un</span>
                  </div>
                  <div style={{ width: 110 }}>
                    <OrcCampoNumero
                      value={orc.precoPonteiraPorDiametro?.[d]}
                      onCommit={(v) => setPrecoPonteira(d, v)}
                      sufixo="R$/un"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editar && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Mão de Obra</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <OrcCampoNumero
              label="Fabricação"
              value={orc.maoDeObra?.fabricacao}
              onCommit={(v) => setMaoDeObra({ fabricacao: v })}
              sufixo="R$"
            />
            <OrcCampoNumero
              label="Instalação"
              value={orc.maoDeObra?.instalacao}
              onCommit={(v) => setMaoDeObra({ instalacao: v })}
              sufixo="R$"
              placeholder="0 (sem instalação)"
            />
          </div>
        </div>
      )}

      {editar && (
        <div style={{ ...cardStyle, padding: "12px 14px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Resumo</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
            {CAMADAS_CORTINA.filter((chave) => calc.camadas[chave]?.ativo).map((chave) => {
              const cc = calc.camadas[chave];
              const linhas = [
                {
                  label: "Tecido",
                  detalhe: `${cc.tecido || "sem nome"} · ${(cc.qtdTecido || 0).toFixed(2)} m`,
                  valor: cc.custoTecido,
                },
                !cc.mesclada && cc.cozTipo && cc.cozTipo !== "Sem COZ"
                  ? { label: "COZ", detalhe: `${cc.cozTipo} · ${(cc.qtdCoz || 0).toFixed(2)} m`, valor: cc.custoCoz }
                  : null,
                cc.deslizantes
                  ? { label: "Deslizantes", detalhe: `${cc.deslizantes.quantidade} un`, valor: cc.deslizantes.total }
                  : null,
                cc.clips ? { label: "Clips", detalhe: `${cc.clips.quantidade} un`, valor: cc.clips.total } : null,
                cc.cordao ? { label: "Cordão", detalhe: `${cc.cordao.metros.toFixed(2)} m`, valor: cc.cordao.total } : null,
                cc.fitaWave
                  ? { label: "Fita Fácil", detalhe: `${cc.fitaWave.metros.toFixed(2)} m`, valor: cc.fitaWave.total }
                  : null,
                cc.varaoBarra
                  ? {
                      label: "Varão",
                      detalhe: `${cc.varaoBarra.diametro} · ${cc.varaoBarra.material} ${cc.varaoBarra.cor} · ${cc.varaoBarra.larguraCobrada.toFixed(2)} m${
                        cc.varaoBarra.precoDefinido ? "" : " · preço a definir"
                      }`,
                      valor: cc.varaoBarra.total,
                    }
                  : null,
                cc.tuboVazaBarra
                  ? {
                      label: "Tubo Vaza",
                      detalhe: `${cc.tuboVazaBarra.diametro} · ${cc.tuboVazaBarra.cor} · ${cc.tuboVazaBarra.larguraCobrada.toFixed(2)} m${
                        cc.tuboVazaBarra.precoDefinido ? "" : " · preço a definir"
                      }`,
                      valor: cc.tuboVazaBarra.total,
                    }
                  : null,
                cc.ilhosOuArgolas
                  ? {
                      label:
                        cc.ilhosOuArgolas.tipo === "Argola"
                          ? "Argolas" + (cc.ilhosOuArgolas.argolaTipo ? " " + cc.ilhosOuArgolas.argolaTipo : "")
                          : "Ilhós",
                      detalhe: `${cc.ilhosOuArgolas.quantidade} un${cc.ilhosOuArgolas.precoDefinido ? "" : " · preço a definir"}`,
                      valor: cc.ilhosOuArgolas.total,
                    }
                  : null,
                cc.ganchos
                  ? {
                      label: "Ganchos",
                      detalhe: `${cc.ganchos.quantidade} un${cc.ganchos.precoDefinido ? "" : " · preço a definir"}`,
                      valor: cc.ganchos.total,
                    }
                  : null,
                cc.flange
                  ? {
                      label: "Flange",
                      detalhe: `${cc.flange.quantidade} un${cc.flange.precoDefinido ? "" : " · preço a definir"}`,
                      valor: cc.flange.total,
                    }
                  : null,
              ].filter(Boolean);
              return (
                <div key={chave}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginBottom: 4 }}>
                    <span>
                      {CAMADA_LABEL[chave]}
                      {cc.mesclada && (
                        <span style={{ fontWeight: 400, color: "var(--ink-soft)", fontStyle: "italic" }}> — costurado junto no Forro</span>
                      )}
                    </span>
                    <span>{fmtValor(cc.custoTotal)}</span>
                  </div>
                  {linhas.map(({ label, detalhe, valor }) => (
                    <div
                      key={label}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, color: "var(--ink-soft)", paddingLeft: 8 }}
                    >
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                        {detalhe && ` — ${detalhe}`}
                      </span>
                      <span style={{ flexShrink: 0 }}>{fmtValor(valor || 0)}</span>
                    </div>
                  ))}
                </div>
              );
            })}

            {(calc.trilho || calc.presilhas || calc.suportes.length > 0 || calc.ponteiras.total > 0) && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginBottom: 4 }}>
                  <span>Estrutura</span>
                  <span>
                    {fmtValor((calc.trilho?.total || 0) + (calc.presilhas?.total || 0) + calc.resumo.suportes + calc.ponteiras.total)}
                  </span>
                </div>
                {calc.trilho && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, color: "var(--ink-soft)", paddingLeft: 8 }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Trilho — {calc.trilho.tipo} — {calc.trilho.larguraCobrada.toFixed(2)} m
                    </span>
                    <span style={{ flexShrink: 0 }}>{fmtValor(calc.trilho.total)}</span>
                  </div>
                )}
                {calc.presilhas && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, color: "var(--ink-soft)", paddingLeft: 8 }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Presilhas — {calc.presilhas.tipo} — {calc.presilhas.quantidade ?? 0} un
                    </span>
                    <span style={{ flexShrink: 0 }}>{fmtValor(calc.presilhas.total)}</span>
                  </div>
                )}
                {calc.suportes.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, color: "var(--ink-soft)", paddingLeft: 8 }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Suportes — {calc.suportes.reduce((soma, s) => soma + (s.qtd || 0), 0)} un
                      {calc.suportes.some((s) => !s.precoDefinido) ? " · preço a definir" : ""}
                    </span>
                    <span style={{ flexShrink: 0 }}>{fmtValor(calc.resumo.suportes)}</span>
                  </div>
                )}
                {Object.keys(calc.ponteiras.porDiametro).length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, color: "var(--ink-soft)", paddingLeft: 8 }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Ponteiras —{" "}
                      {Object.entries(calc.ponteiras.porDiametro)
                        .map(([d, qtd]) => `${qtd}× ${d}`)
                        .join(", ")}
                      {Object.values(calc.ponteiras.precoPorDiametro).some((p) => p == null) ? " · preço a definir" : ""}
                    </span>
                    <span style={{ flexShrink: 0 }}>{fmtValor(calc.ponteiras.total)}</span>
                  </div>
                )}
              </div>
            )}

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginBottom: 4 }}>
                <span>Mão de Obra</span>
                <span>{fmtValor(calc.maoDeObra.total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-soft)", paddingLeft: 8 }}>
                <span>Fabricação</span>
                <span>{fmtValor(calc.maoDeObra.fabricacao)}</span>
              </div>
              {calc.maoDeObra.instalacao > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-soft)", paddingLeft: 8 }}>
                  <span>Instalação</span>
                  <span>{fmtValor(calc.maoDeObra.instalacao)}</span>
                </div>
              ) : (
                <div style={{ color: "var(--ink-soft)", fontStyle: "italic", paddingLeft: 8 }}>Sem instalação</div>
              )}
            </div>
          </div>
          <div
            style={{
              borderTop: "1px solid var(--line)",
              marginTop: 8,
              paddingTop: 8,
              display: "flex",
              justifyContent: "space-between",
              fontWeight: 700,
              fontSize: 14.5,
            }}
          >
            <span>Custo total de materiais</span>
            <span>{fmtValor(calc.resumo.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
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

  const updatePecaOrcamento = (patch) => updatePeca({ orcamento: { ...(peca.orcamento || orcamentoPadrao()), ...patch } });
  const calcOrcamento = calcularOrcamentoPeca(peca);

  const handleImprimirFicha = () => {
    const html = gerarHtmlFichaProducao(pedido, ambiente, peca, peca.orcamento || orcamentoPadrao(), calcOrcamento);
    const janela = window.open("", "_blank");
    if (!janela) return; // pop-up bloqueado pelo navegador
    janela.document.write(html);
    janela.document.close();
    janela.focus();
    janela.print();
  };

  // Cortina: o Valor da peça deixa de ser digitado à mão e passa a ser o
  // custo total de materiais calculado pelo Orçamento — recalcula sempre
  // que largura, trilho (Modelo) ou qualquer campo do Orçamento mudar.
  // Persiana não é coberta por essa funcionalidade e continua com o Valor
  // manual (ValorPeca), como sempre foi.
  useEffect(() => {
    if (MODELOS_COM_ORCAMENTO.includes(peca.modelo)) {
      const calc = calcularOrcamentoPeca(peca);
      if (calc.usaOrcamento && calc.resumo.total !== peca.valor) updatePeca({ valor: calc.resumo.total });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peca.produto, peca.modelo, peca.largura, JSON.stringify(peca.orcamento)]);

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

      <Section title={peca.produto === "Cortina" ? "Modelo (tipo de trilho)" : "Modelo"}>
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

      {peca.produto === "Cortina" ? (
        canVerMateriaisProducao(papel) && (
          <Section title="Orçamento">
            <FichaOrcamento peca={peca} papel={papel} onUpdateOrcamento={updatePecaOrcamento} />
          </Section>
        )
      ) : null}
      {(peca.produto !== "Cortina" || !MODELOS_COM_ORCAMENTO.includes(peca.modelo)) && (
        canVerValores(papel) && (
          <Section title="Valor">
            <ValorPeca peca={peca} onUpdate={updatePeca} />
          </Section>
        )
      )}

      <Section title="Características de produção">
        {peca.produto === "Cortina" && canVerMateriaisProducao(papel) && calcOrcamento.usaOrcamento ? (
          <>
            <CaracteristicasProducao peca={peca} orc={peca.orcamento || orcamentoPadrao()} calc={calcOrcamento} />
            <button onClick={handleImprimirFicha} style={{ ...ghostBtnStyle, width: "auto", marginTop: 10 }}>
              <Printer size={14} /> Imprimir ficha de produção
            </button>
          </>
        ) : (
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
        )}
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
const cardStyle = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: 14,
  boxShadow: "var(--shadow-sm)",
};
const emptyStateStyle = {
  fontSize: 13,
  color: "var(--ink-soft)",
  border: "1px dashed var(--line)",
  borderRadius: 10,
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
  borderRadius: 8,
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
  borderRadius: 7,
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
    borderRadius: 8,
    padding: "11px 14px",
    fontSize: 13.5,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "var(--shadow-sm)",
  };
}
function inputStyle() {
  return {
    width: "100%",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 13.5,
    background: "var(--surface)",
    color: "var(--ink)",
  };
}
