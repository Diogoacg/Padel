# Padel Weekends

App Next.js + Supabase para gerir jogos de padel entre amigos: jogadores, resultados, historico e rating.

## Arranque

```bash
npm install
npm run dev
```

Depois abre `http://localhost:3000`.

## Supabase

1. Cria um projeto no Supabase.
2. Corre o SQL em `supabase/schema.sql` no SQL Editor.
3. Copia `.env.example` para `.env.local`.
4. Preenche `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Nesta primeira versao a UI usa estado local para acelerar o prototipo. O cliente Supabase ja esta em `lib/supabase.ts`, pronto para trocar as operacoes locais por queries reais.

## Proximas funcoes boas

- Login por grupo privado.
- Persistencia real dos jogadores e jogos no Supabase.
- Pagina de perfil por jogador com forma recente.
- Temporadas e rankings mensais.
- Convites para marcar jogos ao fim de semana.
