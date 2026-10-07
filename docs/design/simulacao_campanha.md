# Simulação de campanha (camada de comandante)

Gerado por `npm run sim:campanha` — 4 campanhas por capítulo, 90 dias cada, batalhas resolvidas por sorteio (75% de vitória).
Números por mês, médias entre as campanhas.

| Capítulo | Ouro líquido | Batalhas | Vitórias | Crises surgidas | Crises atendidas | Crises perdidas | Forças combatidas | Forças ativas | Contratos de facção | Eventos de viagem | Dias de fome | Províncias (Resistência/Coroa/Culto do Véu/Vazio/Livre) | Reputação (soma) | Informação/Influência (fim) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Prólogo | 914 | 10.7 | 74% | 0.0 | 0.0 | 0.0 | 0.7 | 2.8 | 2.8 | 2.0 | 5.6 | 0/26/0/0/33 | 24 | 10/1 |
| Ato 1 | 1235 | 11.9 | 76% | 7.9 | 0.7 | 1.3 | 0.7 | 2.9 | 2.0 | 1.8 | 4.2 | 1/25/1/0/32 | -97 | 5/4 |
| Ato 2 | 2280 | 13.8 | 77% | 6.8 | 2.4 | 0.5 | 1.7 | 2.2 | 2.0 | 1.8 | 1.3 | 6/20/0/0/32 | -6 | 8/22 |
| Ato 3 | 3340 | 14.1 | 80% | 16.9 | 3.3 | 7.1 | 0.9 | 1.7 | 1.8 | 2.4 | 2.0 | 6/20/0/0/32 | -73 | 8/17 |
| Ato 4 | 1865 | 11.3 | 73% | 11.1 | 1.7 | 2.8 | 0.6 | 3.3 | 0.7 | 1.8 | 3.9 | 6/0/0/1/51 | -101 | 4/5 |
| Ato 5 | 3070 | 9.6 | 83% | 7.3 | 0.6 | 0.4 | 0.4 | 2.4 | 1.8 | 2.0 | 6.5 | 6/0/0/1/51 | -82 | 5/5 |
| Ato 6 | 1343 | 8.4 | 73% | 7.3 | 0.5 | 0.7 | 0.4 | 2.1 | 0.6 | 2.1 | 6.4 | 6/0/0/1/52 | -102 | 3/5 |
| Ato 7 | 2852 | 9.7 | 73% | 13.7 | 2.6 | 1.1 | 0.2 | 3.9 | 0.2 | 1.8 | 4.2 | 5/0/0/8/45 | -247 | 4/5 |
| Ato 8 | 2573 | 8.0 | 79% | 7.2 | 0.5 | 0.5 | 0.3 | 3.7 | 0.9 | 1.8 | 5.8 | 6/0/0/2/50 | -98 | 4/5 |

## Sistema do ato (primeira campanha de cada capítulo, no fim)

- **Prólogo — O Comandante do Reino**: lendas com pista 0
- **Ato 1 — Crianças da Lua**: Favor 20 · Suspeita 15 · lendas com pista 1
- **Ato 2 — Teoria da Conspiração**: Procurado máx. 3 · pistas 0 · lendas com pista 1
- **Ato 3 — A Coroa e a Porta**: preparo 3 · frentes 86/76 71/76 71/61 71/76 71/61 · lendas com pista 1
- **Ato 4 — Incursões e União**: portais 2 · Terra Morta 7 · alianças 0 · levados 383 · lendas com pista 0
- **Ato 5 — Do Outro Lado**: corrupção máx. 60 · mutações 6 · caravana — · lendas com pista 0
- **Ato 6 — A Metade Esquecida**: acampamento Cais da Bruma · trocas 2 · lendas com pista 0
- **Ato 7 — Os Barões**: Barões: postos restantes 0 · rancor 0/0/0 · Despertar 25 · lendas com pista 0
- **Ato 8 — O Aniquilador**: força 1 · posto 1/6 caminho 0/8 coracao 0/10 · lendas com pista 1

## Como ler

- O piloto automático é simples: atende a crise mais perto que ainda dá tempo, aceita contratos de facção,
  compra rações quando faltam três dias, intercepta o que aparece no caminho, revela e frustra planos do inimigo.
  Um jogador atento faz melhor; o objetivo é medir a pressão de cada sistema, não a vitória.
- "Crises perdidas" altas num capítulo significam pressão demais para dois esquadrões; "dias de fome" acima de
  zero mostram rotas longas sem cidade (terras distantes, Vazio).
- Ouro líquido inclui renda das províncias, contratos, manutenção dos postos e compras de rações.
