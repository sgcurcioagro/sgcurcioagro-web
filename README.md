# SGAgro — Portal do cliente (Fase Supabase)

Site estático (HTML/CSS/JS puro) que autentica com Supabase Auth e mostra
só os relatórios do cliente logado (protegido por RLS no banco, não só na
tela).

## Publicar (GitHub + Vercel, mesmo fluxo de sempre)

1. Cria um repositório novo no GitHub (ex: `sgagro-portal`)
2. Sobe esta pasta inteira (`sgagro/`) pra dentro dele
3. Na Vercel: **Add New → Project → Import** esse repositório → Deploy
   (zero configuração, é estático)

**`config.js` pode ir pro repositório sem problema** — a URL e a anon key
são públicas por design. **Nunca** coloque a chave secreta (`sb_secret_...`)
em nenhum arquivo desta pasta.

## Testar login pela primeira vez

1. Abre a URL publicada
2. Entra com o e-mail/senha da Gislaine (o usuário de teste que você criou
   no Supabase em Authentication → Users)
3. Se aparecer a lista de relatórios na lateral — funcionou. Clica num
   relatório: deve aparecer o mapa, os KPIs (média/mín/máx/desvio) e o
   histograma
4. Clica em algum ponto do mapa, dentro da área colorida — deve aparecer
   o valor do pixel ali (Inspetor de Pixel, na lateral direita)

## Se der erro de login

- Confere se o e-mail/senha batem exatamente com o que está cadastrado em
  Authentication → Users
- Se aparecer erro tipo "Email not confirmed": no Supabase, vai em
  Authentication → Users → clica no usuário → confirma o e-mail manualmente
  (ou desative a exigência de confirmação em Authentication → Settings →
  "Confirm email" por enquanto, pra testes)

## Se logar mas a lista de relatórios ficar vazia

Confere no SQL Editor do Supabase, rodando:
```sql
select c.nome, c.auth_user_id, l.nome as lavoura, r.label
from clientes c
join lavouras l on l.cliente_id = c.id
join relatorios r on r.lavoura_id = l.id;
```
Se aparecer a linha da Gislaine ali mas o site não mostra nada, o problema
é RLS (o `auth_user_id` da tabela `clientes` pode não bater com o UID de
quem logou) — me chama com o resultado dessa consulta que eu ajudo a achar
o que diverge.

## Adicionando o próximo cliente

1. No QGIS, roda `mod_web_export.exportar_para_supabase(...)` com o nome
   do cliente/lavoura novos — **mas o cliente precisa existir antes** na
   tabela `clientes` com um `auth_user_id` válido
2. Pra criar o cliente novo: Authentication → Users → Add user (cria o
   login dele) → copia o UID → SQL Editor:
   ```sql
   insert into clientes (nome, auth_user_id)
   values ('Nome do Cliente', 'UID-COPIADO-AQUI');
   ```
3. Roda o script do QGIS de novo com esse nome de cliente

Não precisa mexer em nada do site pra isso — é só dado novo entrando no
banco.
