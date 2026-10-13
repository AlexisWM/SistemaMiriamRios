# Sistema de Medição de Cortinas

Projeto React + Supabase (backend real: banco de dados Postgres, autenticação
de verdade e funções de servidor). Substitui a versão anterior que rodava
como artefato do Claude.

---

## 1. Criar o projeto no Supabase

1. Crie uma conta em https://supabase.com (tem plano gratuito) e clique em
   **New project**.
2. Anote a **senha do banco** que você definir (só usada internamente).
3. Espere o projeto terminar de provisionar (1–2 minutos).

## 2. Rodar o schema (tabelas, permissões, contador de pedidos)

1. No painel do projeto, abra **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/schema.sql` deste repositório, copie tudo e
   cole no editor.
3. Clique em **Run**. Se aparecer "Success", está pronto.

Isso cria as tabelas `perfis`, `pedidos`, `eventos`, a numeração automática
de pedidos e todas as regras de acesso (RLS) por perfil.

## 3. Publicar a Edge Function `manage-user`

Ela é obrigatória: é o que permite ao Gestor/Gestor Master criar e editar
outros usuários com segurança (usa a chave de administrador, que nunca pode
ficar no navegador).

```bash
# instale a CLI do Supabase (uma vez só, na sua máquina)
npm install -g supabase

# faça login
supabase login

# ligue esta pasta ao seu projeto (pega o "project ref" na URL do painel,
# algo como https://supabase.com/dashboard/project/SEU-PROJECT-REF)
supabase link --project-ref SEU-PROJECT-REF

# publique a função
supabase functions deploy manage-user
```

## 4. Criar o primeiro usuário (Alexis Machado — Gestor Master)

Como a criação normal de usuários passa pela Edge Function (que exige já
existir alguém logado como Gestor/Gestor Master), o **primeiro** usuário
precisa ser criado manualmente, uma única vez:

1. No painel do Supabase: **Authentication** → **Users** → **Add user**
   → **Create new user**.
   - Email: `alexis.machado@login.suamedicao.app`
   - Senha: `alexis1234` (troque depois pelo app, em "Editar usuário")
   - Marque "Auto Confirm User".
2. Copie o **UUID** do usuário criado (aparece na lista).
3. Volte no **SQL Editor** e rode (trocando `COLE-O-UUID-AQUI`):

   ```sql
   insert into perfis (id, nome, login, papel, ativo)
   values ('COLE-O-UUID-AQUI', 'Alexis Machado', 'Alexis Machado', 'Gestor Master', true);
   ```

Pronto — agora dá para entrar no app digitando **Alexis Machado** /
**alexis1234**, e ela pode criar todos os outros usuários (Vendedor, Gestor,
Fábrica, Instalador) direto pela tela "Usuários" do sistema.

> Nota sobre o "e-mail": o app pede só "nome de usuário" e senha — por
> baixo dos panos isso vira um e-mail interno (`nome.de.usuario@login.
> suamedicao.app`) só porque o Supabase Auth exige um formato de e-mail.
> Ninguém precisa ter ou checar essa caixa de e-mail.

## 5. Configurar e rodar o projeto localmente

Precisa ter o **Node.js** instalado (baixe em https://nodejs.org, versão
LTS).

```bash
# instale as dependências
npm install

# copie o arquivo de exemplo e preencha com os dados do seu projeto
# (Project Settings → API → Project URL / anon public key)
cp .env.example .env

# rode em modo desenvolvimento
npm run dev
```

Abra o endereço que aparecer no terminal (algo como `http://localhost:5173`).

### Acesso pelo celular / fora da loja

Como você escolheu Supabase (hospedado na nuvem), o **banco de dados já é
acessível de qualquer lugar** — o que falta é hospedar o **site** (o
`npm run dev` só roda na sua máquina). Para acesso remoto de verdade,
publique o resultado de `npm run build` em um serviço de hospedagem
gratuito, por exemplo:

- **Vercel** (https://vercel.com) ou **Netlify** (https://netlify.app):
  conecte o repositório do GitHub, configure as duas variáveis de ambiente
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) no painel deles, e cada
  push atualiza o site sozinho.

## 6. Subir este projeto para o GitHub

Eu não tenho como criar o repositório ou fazer o push por você (não tenho
acesso à internet nem às suas credenciais do GitHub a partir daqui) — mas
são só estes passos:

```bash
# dentro da pasta do projeto
git init
git add .
git commit -m "Sistema de medição de cortinas — versão com backend Supabase"

# crie um repositório vazio em https://github.com/new (não marque "adicionar README")
# depois troque SEU-USUARIO/SEU-REPOSITORIO abaixo pelo endereço que o GitHub mostrar:
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git branch -M main
git push -u origin main
```

O arquivo `.gitignore` já impede que `node_modules` e o seu `.env` (com as
chaves) sejam enviados ao GitHub.

---

## Estrutura do projeto

```
├── index.html
├── package.json
├── vite.config.js
├── .env.example          ← copie para .env
├── supabase/
│   ├── schema.sql         ← rode no SQL Editor do Supabase
│   └── functions/
│       └── manage-user/   ← Edge Function (criar/editar usuário)
└── src/
    ├── main.jsx
    ├── App.jsx             ← todo o sistema (telas, regras, componentes)
    └── lib/
        ├── supabaseClient.js
        └── db.js           ← única camada que fala com o Supabase
```

Toda a lógica e as telas continuam as mesmas do sistema que já estava
funcionando — só a forma de guardar e buscar os dados mudou (de
`window.storage` para Supabase). Se quiser mexer em alguma regra de
negócio (permissões, status automático, etc.), é tudo em `src/App.jsx`,
exatamente como antes.

## O que ficou mais forte com o backend real

- **Login de verdade**: senha nunca passa nem fica gravada em texto puro em
  lugar nenhum acessível pelo navegador — é o Supabase Auth cuidando disso.
- **Contador de pedidos sem duplicidade**: agora é uma sequence atômica do
  Postgres, não existe mais a janela de corrida que tínhamos documentado.
- **Permissão reforçada no banco**: além das regras já existentes na tela
  (quem vê o quê), o banco também bloqueia por conta própria — ex.: mesmo
  que um bug na interface tentasse mostrar um pedido de "Orçamento Passado"
  para a Fábrica, o banco não entrega essa linha.
- **Acesso de qualquer lugar**: uma vez publicado (passo 5), o vendedor
  acessa do celular fora da loja normalmente.

## Próximos passos possíveis (não incluídos agora)

- Separar `ambientes`/`peças` em tabelas próprias (hoje ficam como um campo
  jsonb dentro de `pedidos`) — só vale a pena se o volume de dados crescer
  muito ou se for necessário fazer relatórios/consultas cruzando peças de
  vários pedidos.
- Upload de fotos (Supabase Storage já viria pronto para isso).
- Notificações (e-mail/WhatsApp) quando um pedido muda de status.
