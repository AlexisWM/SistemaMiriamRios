-- Versões de orçamento por pedido (rode no SQL Editor do Supabase).
-- Guarda o orçamento "em uso" (nome) e as outras opções salvas, cada uma com
-- as peças/medidas/valores daquele momento.
alter table pedidos add column if not exists orcamentos jsonb not null default '{}'::jsonb;
