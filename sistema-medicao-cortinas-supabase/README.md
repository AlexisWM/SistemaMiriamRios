# Sistema de Medição de Cortinas

Projeto React + Supabase (backend real: banco de dados Postgres, autenticação
de verdade e funções de servidor).

## ✅ O backend já está pronto

O projeto Supabase **supa-miriamrios** já está configurado e conectado:

- Tabelas `perfis`, `pedidos`, `eventos` criadas, com todas as regras de
  acesso (RLS) por perfil.
- Numeração automática de pedidos (sequence atômica no Postgres).
- Edge Function `manage-user` publicada (é o que permite ao Gestor/Gestor
  Master criar e editar outros usuários com segurança).
- Usuário **Alexis Machado** (Gestor Master) já existe no login:
  `alexismachado@miriamrios.com`. Ela consegue entrar no app digitando só
  **Alexis Machado** e a senha que já foi definida para essa conta (se você
  não lembra a senha, veja "Esqueci a senha" mais abaixo).
- O arquivo **`.env`** já vem preenchido com a URL e a chave deste projeto
  — não precisa copiar nada de `.env.example`.

Ou seja: os passos 1 a 4 da versão anterior deste README (criar projeto,
rodar schema, publicar função, criar primeiro usuário) **já foram feitos**.
Pule direto para "Rodar o projeto localmente" abaixo.

> Nota sobre o "e-mail": o app pede só "nome de usuário" e senha — por
> baixo dos panos isso vira `nomedeusuario@miriamrios.com` só porque o
> Supabase Auth exige um formato de e-mail. Ninguém precisa checar essa
> caixa de e-mail.

### Esqueci a senha da Alexis Machado

No painel do Supabase: **Authentication** → **Users** → clique no usuário
`alexismachado@miriamrios.com` → **Reset password** (ou peça para eu
redefinir por aqui mesmo, já que estou conectado ao projeto).

## Rodar o projeto localmente

Precisa ter o **Node.js** instalado (baixe em https://nodejs.org, versão
LTS).

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (algo como `http://localhost:5173`).

### Acesso pelo celular / fora da loja

O banco de dados já está na nuvem (Supabase) e acessível de qualquer lugar
— falta só publicar o **site** em algum lugar acessível pela internet,
porque `npm run dev` roda só na sua máquina. Publique o resultado de
`npm run build` em um serviço gratuito, por exemplo:

- **Vercel** (https://vercel.com) ou **Netlify** (https://netlify.app):
  conecte o repositório do GitHub, configure as duas variáveis de ambiente
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — os mesmos valores que
  estão no `.env`) no painel deles, e cada push atualiza o site sozinho.

## Instalar como app (PWA)

O sistema agora é um **PWA** (Progressive Web App) — depois de publicado
(passo acima), dá pra "instalar" ele no celular ou computador como um app
de verdade: ícone na tela inicial, abre em janela própria (sem barra de
endereço do navegador), sem precisar passar pela loja de aplicativos.

**No Android (Chrome):** abra o site publicado → toque nos três pontinhos
(⋮) → **"Instalar app"** (ou **"Adicionar à tela inicial"**). Em alguns
casos o Chrome já sugere um banner de instalação sozinho.

**No iPhone/iPad (Safari — obrigatório ser o Safari, não funciona em
outro navegador no iOS):** abra o site publicado → toque no ícone de
compartilhar (□ com uma seta) → **"Adicionar à Tela de Início"**.

**No computador (Chrome/Edge):** abra o site publicado → clique no ícone
de instalação que aparece do lado direito da barra de endereço (parece uma
tela com uma seta) → **"Instalar"**.

Detalhes técnicos, se precisar mexer:
- O manifest e o ícone do app são gerados automaticamente pelo
  `vite-plugin-pwa` a partir do que está configurado em `vite.config.js` —
  não precisa criar `manifest.json` à mão.
- Os ícones ficam em `public/` (`icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.ico`).
- O app funciona **offline só pra abrir a casca** (visual/telas) — os
  dados de verdade (pedidos, login) sempre exigem internet, de propósito,
  pra ninguém nunca ver uma informação desatualizada ou errada.
- Depois de qualquer `npm run build` novo, quem já tinha instalado recebe
  a atualização sozinho da próxima vez que abrir o app (o service worker
  atualiza em segundo plano).

## Subir este projeto para o GitHub

```bash
git init
git add .
git commit -m "Sistema de medição de cortinas — versão com backend Supabase"
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git branch -M main
git push -u origin main
```

O `.gitignore` já impede que `node_modules` e o `.env` (com as chaves)
sejam enviados ao GitHub — ao publicar em Vercel/Netlify, configure as
mesmas variáveis de ambiente por lá.

---


## Estrutura do projeto

```
├── index.html
├── package.json
├── vite.config.js          ← configuração do PWA (vite-plugin-pwa)
├── public/                 ← ícones do app instalado
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   ├── apple-touch-icon.png
│   └── favicon.ico
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
