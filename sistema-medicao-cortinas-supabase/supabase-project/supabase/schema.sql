-- ============================================================
-- Sistema de Medição de Cortinas — schema do Supabase
-- ------------------------------------------------------------
-- Rode este arquivo inteiro em: Supabase Dashboard → SQL Editor → New query
-- (cole tudo e clique em "Run"). Pode rodar de novo sem problema — os
-- comandos usam "if not exists" / "or replace" onde possível.
-- ============================================================

-- ------------------------------------------------------------
-- 1) PERFIS (papel de cada usuário autenticado)
-- ------------------------------------------------------------
-- Complementa a tabela auth.users (que o próprio Supabase Auth gerencia e
-- guarda a senha, com hash forte, fora do alcance do app). Aqui só ficam os
-- dados que o sistema usa: nome de exibição, "login" original digitado,
-- papel de acesso e se está ativo.
create table if not exists perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  login text not null unique,
  papel text not null check (
    papel in ('Gestor Master', 'Gestor', 'Vendedor', 'Fábrica', 'Instalador')
  ),
  ativo boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now()
);

alter table perfis enable row level security;

-- Qualquer pessoa autenticada pode ver a lista de perfis (nome + papel;
-- é o que a tela "Usuários" e os selos de quem mediu/produziu precisam).
drop policy if exists "perfis_select" on perfis;
create policy "perfis_select" on perfis for select
  to authenticated
  using (true);

-- Só a Edge Function `manage-user` (que roda com a chave Service Role,
-- ignorando RLS) cria ou edita perfis — o navegador nunca escreve direto
-- aqui, então não existe policy de insert/update/delete para o usuário comum.

-- ------------------------------------------------------------
-- 2) CONTADOR DE PEDIDOS (sequence atômica de verdade)
-- ------------------------------------------------------------
create sequence if not exists pedidos_numero_seq start 1;

create or replace function next_pedido_numero()
returns integer
language sql
security definer
as $$
  select nextval('pedidos_numero_seq')::integer;
$$;

-- ------------------------------------------------------------
-- 3) PEDIDOS
-- ------------------------------------------------------------
-- Ambientes e peças continuam como uma estrutura aninhada (igual ao app
-- original), guardada na coluna `ambientes` (jsonb) em vez de virarem
-- tabelas separadas — isso evitou reescrever toda a lógica de
-- ambiente/peça, que já estava pronta e testada.
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  cliente text not null,
  telefone text,
  endereco text,
  vendedor text,
  criado_em timestamptz not null default now(),
  status text,
  ambientes jsonb not null default '[]'::jsonb
);

create index if not exists pedidos_status_idx on pedidos (status);

alter table pedidos enable row level security;

-- Cada papel só enxerga os pedidos que faz sentido enxergar — a mesma
-- regra que já existia no app, agora também reforçada pelo banco (mesmo
-- que um dia apareça um bug na interface, o banco não entrega o que não
-- deveria).
drop policy if exists "pedidos_select_por_papel" on pedidos;
create policy "pedidos_select_por_papel" on pedidos for select
  to authenticated
  using (
    case (select papel from perfis where id = auth.uid())
      when 'Fábrica' then status in ('Em produção', 'Parcialmente Fabricado', 'Disponível para instalar')
      when 'Instalador' then status = 'Disponível para instalar'
      else true
    end
  );

-- Criar/editar pedido: todo mundo exceto Instalador (a Fábrica precisa
-- editar para marcar peça disponível; o restante das regras finas — quem
-- pode mexer em qual campo — continua garantido pela interface, igual
-- antes).
drop policy if exists "pedidos_insert" on pedidos;
create policy "pedidos_insert" on pedidos for insert
  to authenticated
  with check ((select papel from perfis where id = auth.uid()) <> 'Instalador');

drop policy if exists "pedidos_update" on pedidos;
create policy "pedidos_update" on pedidos for update
  to authenticated
  using ((select papel from perfis where id = auth.uid()) <> 'Instalador');

drop policy if exists "pedidos_delete" on pedidos;
create policy "pedidos_delete" on pedidos for delete
  to authenticated
  using ((select papel from perfis where id = auth.uid()) in ('Gestor', 'Gestor Master'));

-- ------------------------------------------------------------
-- 4) EVENTOS (agenda de medição / instalação)
-- ------------------------------------------------------------
create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos (id) on delete cascade,
  pedido_numero integer not null,
  cliente text,
  tipo text not null check (tipo in ('Medida', 'Instalação')),
  data date not null,
  hora text,
  observacao text,
  criado_por text,
  criado_em timestamptz not null default now()
);

create index if not exists eventos_pedido_idx on eventos (pedido_id);
create index if not exists eventos_data_idx on eventos (data);

alter table eventos enable row level security;

drop policy if exists "eventos_select" on eventos;
create policy "eventos_select" on eventos for select
  to authenticated
  using (true);

drop policy if exists "eventos_insert" on eventos;
create policy "eventos_insert" on eventos for insert
  to authenticated
  with check ((select papel from perfis where id = auth.uid()) <> 'Instalador');

drop policy if exists "eventos_delete" on eventos;
create policy "eventos_delete" on eventos for delete
  to authenticated
  using ((select papel from perfis where id = auth.uid()) <> 'Instalador');

-- ============================================================
-- Depois de rodar este arquivo, siga o README para criar o primeiro
-- usuário (Alexis Machado, Gestor Master) e para publicar a Edge
-- Function `manage-user` (supabase/functions/manage-user).
-- ============================================================
