# Skill Webs completas

Balanceamento base:
- PA base: 30
- Mover 1 tile: 3 PA
- Ataque básico: 6 PA
- Level cap: 30

Formato de cada skill:
- Nome — Tipo (instant / cast / sustain / passive) — Alvo (single / aoe / ally / self)
- Range (tiles) • LoS (sim/não) • PA • MP • CD (turnos) • Duração • Tags
- Fórmula (dano/cura/escudo) • Teste (se tiver CC) • Pré-requisito (cadeia)

Notas de balanceamento:
- Hard CC (stun/skip turn) aparece pouco e com CD alto.
- Invulnerável só em ultimates e por 1 turno (ou estase com custo/limitação).
- Sustain: só 1 sustain por unidade; caster fica imóvel; no início do turno pergunta se mantém; se sofrer dano faz Teste de Concentração (INT vs RES) para não quebrar.

---

## GUERREIRO — BERSERK (Colosso da Fúria) — 20 nós

### Passiva de ramo
1. **Sangue por Poder** — passive — self
Range — • LoS — • PA 0 • MP 0 • CD — • Duração — • Tags PASSIVE
Fórmula: +0.8% dano por 1% HP perdido (cap 40%).
Pré: Centro Guerreiro.

2. **Fúria: Acúmulo** — passive — self
Ao sofrer dano, ganha 1 stack Fúria (cap 6). Cada stack: +2% dano, -1% aim. Ao fim do turno sem sofrer dano, perde 1 stack.
Pré: 1

### Ativos
3. **Golpe Temerário** — instant — single
Range 1 • LoS sim • PA 9 • MP 0 • CD 1 • Dur — • Tags MELEE PHYSICAL
Dano: (weapon + 1.8*STR) ; você recebe -15% DEF até o próximo turno.
Pré: 1

4. **Corte Sangrento** — instant — single
Range 1 • LoS sim • PA 9 • MP 0 • CD 2 • Dur 3 • Tags MELEE DOT
Dano: (weapon + 1.2STR) + Sangramento: (0.6STR) por turno.
Teste: STR vs FORT (se falhar, sangra só 2 turnos).
Pré: 3

5. **Cabeçada** — instant — single
Range 1 • LoS sim • PA 12 • MP 0 • CD 3 • Dur 1 • Tags CC_HARD MELEE
Dano: (weapon0.6 + 1.0STR).
Teste: STR vs FORT para Stun 1 turno. Se aplicar stun, você sofre 10% do seu HP max como recoil.
Pré: 3

6. **Grito de Guerra** — cast — aoe allies
Range 0 (aura 4) • LoS não • PA 12 • MP 6 • CD 4 • Dur 2 • Tags BUFF
Buff: aliados em 4 tiles ganham +10 AIM e +10% dano.
Pré: 1

7. **Ignorar Dor** — instant — self
Range — • LoS — • PA 9 • MP 6 • CD 5 • Dur 2 • Tags DEFENSE
Por 2 turnos: 30% do dano recebido vira cura no fim do turno (cap: 12% HP/turno).
Pré: 2

8. **Salto Esmagador** — instant — aoe
Range 6 • LoS sim • PA 15 • MP 0 • CD 4 • Dur — • Tags MOBILITY AOE
Pula para tile alvo; dano em raio 1: (weapon + 1.4*STR).
Teste: STR vs FORT para Prone 1 turno (soft-hard; se boss, vira -3 tiles move).
Pré: 5

9. **Quebra-Ossos** — instant — single
Range 1 • LoS sim • PA 12 • MP 0 • CD 3 • Dur 3 • Tags DEBUFF
Dano: (weapon + 1.3*STR). Debuff: -15% armor por 3 turnos.
Pré: 4

10. **Vingança** — sustain — self
Range — • LoS — • PA 9 • MP 4 (por turno) • CD 3 • Dur sustain • Tags SUSTAIN COUNTER
Enquanto manter: se for atingido em melee, faz 1 contra-ataque (weapon*0.7 + STR).
Concentração: INT vs RES do atacante ao tomar dano, se falhar quebra.
Pré: 7

11. **Rodopio da Morte** — instant — aoe
Range 0 (raio 1) • LoS não • PA 15 • MP 0 • CD 4 • Dur — • Tags AOE MELEE
Dano: (weapon + 1.1STR) em todos adjacentes; aplica Sangramento leve (0.3STR por 2T).
Pré: 8

12. **Adrenalina** — instant — self
PA 6 • MP 6 • CD 5
Remove slows/roots/stun (se estiver stun, vira “remove no início do próximo turno”). Ganha +3 tiles move por 1T.
Pré: 6

13. **Executar** — instant — single
Range 1 • PA 12 • MP 0 • CD 3
Se alvo <25% HP: dano (weapon + 2.6STR). Senão: (weapon + 1.4STR).
Pré: 9

14. **Sedento** — instant — self
PA 6 • MP 4 • CD 3 • Dur 1
Seu próximo ataque cura 40% do dano causado (cap 10% HP).
Pré: 9

15. **Intimidação** — cast — aoe enemies
Range 0 (raio 4) • PA 12 • MP 8 • CD 5 • Dur 2
Debuff: -10 AIM e -10% crit.
Teste: INT vs RES (se falhar, dura 1T).
Pré: 6

16. **Arremesso de Arma** — instant — single
Range 6 • LoS sim • PA 12 • MP 0 • CD 4
Dano: (weapon + 0.8STR + 0.8DEX). Você fica “Desarmado” 1 turno (ataque básico vira soco 0.6*STR).
Pré: 11

17. **Postura do Javali** — sustain — self
PA 9 • MP 4/turn • CD 4
Imune a knockback/prone; +20% armor; -2 tiles move.
Concentração ao tomar dano.
Pré: 10

18. **Corte Duplo** — instant — single
Range 1 • PA 12 • MP 0 • CD 2
Dois hits: cada um (weapon0.75 + 0.9STR) com -10 AIM.
Pré: 13

19. **Último Suspiro** — passive — self
1x por missão: ao cair a 0 HP, fica com 1 HP e ganha 12 PA no próximo turno.
Pré: 17

20. **Avatar da Ira** — ultimate — self
PA 24 • MP 16 • CD 8 • Dur 3
+30% dano, +20 armor, +2 tiles move, imune a fear; ao acabar: “Exausto” 2T (-10 PA, -10 AIM).
Pré: 19

---

## GUERREIRO — GUARDIÃO (Sentinela da Ordem) — 20 nós
1. **Fortaleza Móvel** — passive — self
Aliados adjacentes: +15% cover bônus e +10 RES.
Pré: Centro Guerreiro

2. **Provocação** — instant — single
Range 6 • LoS sim • PA 9 • MP 4 • CD 3 • Dur 1
Força alvo a te priorizar (AI aggro).
Teste: STR vs RES (boss reduz eficiência).
Pré: 1

3. **Levantar Escudo** — sustain — self
PA 9 • MP 3/turn • CD 2
+35% armor, +20 cover bônus; não pode atacar (só mover).
Pré: 1

4. **Interceptar** — instant — ally
Range 6 • LoS sim • PA 9 • MP 4 • CD 2 • Dur 1
Vira “guard” num aliado: próximo hit nele redireciona pra você.
Pré: 1

5. **Golpe de Escudo** — instant — single
Range 1 • PA 9 • MP 0 • CD 2
Dano: (weapon0.6 + 1.1STR) + knockback 1 tile.
Teste: STR vs FORT para knockback extra.
Pré: 2

6. **Solo Sagrado** — cast — aoe allies
Range 6 • LoS sim • PA 12 • MP 10 • CD 5 • Dur 3
Área raio 2: cura (0.6VIT + 0.6INT) por turno e +10 RES.
Pré: 4

7. **Barricada** — instant — utility
Range 4 • LoS sim • PA 12 • MP 8 • CD 5 • Dur 3
Cria cobertura completa (um segmento 2 tiles).
Pré: 3

8. **Desarme** — instant — single
Range 1 • PA 12 • MP 4 • CD 5 • Dur 2
Alvo perde “weapon_power” 2T (-30% dano básico).
Teste: STR vs FORT.
Pré: 5

9. **Grito de Proteção** — cast — aoe allies
Range 0 (raio 4) • PA 12 • MP 10 • CD 6 • Dur 2
Gera escudo: (1.2*VIT) HP temporário.
Pré: 6

10. **Imobilizar** — instant — single
Range 1 • PA 9 • MP 6 • CD 4 • Dur 1
Root 1T (não move).
Teste: STR vs FORT.
Pré: 5

11. **Contra-Golpe Defensivo** — instant — single
Range 1 • PA 9 • MP 0 • CD 2
Dano: (armor0.8 + VIT1.0) (escala com tanque).
Pré: 3

12. **Formação Testudo** — sustain — aoe allies
Range 0 (raio 2) • PA 12 • MP 6/turn • CD 6
Aliados no raio: -40% dano de projétil; -1 tile move.
Pré: 9

13. **Vontade de Ferro** — passive — self
+25% RES; 1º stun recebido por missão vira “slow 1T”.
Pré: 1

14. **Correntes da Ordem** — cast — single
Range 6 • LoS sim • PA 12 • MP 10 • CD 5
Puxa alvo 3 tiles em sua direção (se possível).
Teste: STR vs FORT.
Pré: 10

15. **Sentença** — instant — single
Range 1 • PA 12 • MP 6 • CD 4
Dano: (0.8VIT + 0.8STR) + (alvo_HP_atual * 6%). Cap: 18% HP.
Pré: 11

16. **Aura de Espinhos** — sustain — self
PA 9 • MP 5/turn • CD 5
Quem te bate em melee toma (0.8*VIT) dano.
Pré: 12

17. **Bastião** — passive — self
Ao bloquear/receber hit em cover: cura 2% HP (cap 6%/turn).
Pré: 16

18. **Choque Sísmico** — cast — cone
Range 0 (cone 3) • PA 15 • MP 12 • CD 6
Dano: (STR1.0 + VIT0.8).
Teste: STR vs FORT para Prone 1T (boss: -3 tiles).
Pré: 14

19. **Guarda-Costas** — sustain — ally
Range 6 • PA 9 • MP 5/turn • CD 5
Enquanto manter: se aliado sofrer ataque, você faz 1 contra-ataque no agressor (se em range 6).
Pré: 4

20. **A Última Muralha** — ultimate — self
PA 24 • MP 18 • CD 9 • Dur 1
Invulnerável 1T, remove debuffs, e ganha +10 RES por 2T depois.
Pré: 19

---

## GUERREIRO — GUERREIRO ARCANO (Executor Arcano) — 20 nós
1. **Lâmina de Mana** — passive — self
Ataques básicos: +3 MP (cap 6/turn).
Pré: Centro Guerreiro

2. **Encantar Arma: Fogo** — sustain — self
PA 9 • MP 4/turn • CD 3
Ataques ganham + (INT*0.6) fogo e aplicam burn leve 2T.
Pré: 1

3. **Encantar Arma: Gelo** — sustain — self
PA 9 • MP 4/turn • CD 3
Ataques aplicam slow (-1 tile move) 2T (Teste INT vs RES).
Pré: 1

4. **Projétil Arcano** — instant — single
Range 8 • LoS sim • PA 9 • MP 6 • CD 2
Dano: (weapon0.7 + INT1.4).
Pré: 1

5. **Teleporte de Combate** — instant — utility
Range 6 • LoS sim • PA 12 • MP 10 • CD 4
Teleporta para tile visível; ganha +10 AIM no próximo ataque.
Pré: 4

6. **Escudo de Mana** — sustain — self
PA 9 • MP 6/turn • CD 5
50% do dano recebido drena MP primeiro; se MP zerar, quebra.
Pré: 4

7. **Corte Dimensional** — instant — single
Range 1 • PA 12 • MP 8 • CD 3
Dano: (weapon + STR1.0 + INT1.0). Ignora 35% armor.
Pré: 4

8. **Explosão na Lâmina** — instant — aoe
Range 1 (raio 1) • PA 15 • MP 10 • CD 4
Dano: (weapon0.9 + INT1.2) em área.
Pré: 7

9. **Vórtice Rúnico** — cast — aoe
Range 6 • LoS sim • PA 15 • MP 12 • CD 6 • Dur 1
Puxa inimigos 2 tiles para o centro.
Teste: INT vs FORT.
Pré: 8

10. **Dissipar Magia** — instant — single
Range 6 • LoS sim • PA 9 • MP 10 • CD 5
Remove 1 buff; se remover, causa (INT*0.8) dano.
Pré: 4

11. **Aceleração Arcana** — instant — self
PA 6 • MP 14 • CD 6 • Dur 1
Ganha +9 PA imediatamente (não ultrapassa PA_max).
Pré: 5

12. **Prisão Rúnica** — cast — single
Range 6 • LoS sim • PA 12 • MP 12 • CD 6 • Dur 1
Root 1T e -10 AIM.
Teste: INT vs RES.
Pré: 9

13. **Espada-Trovão** — instant — single
Range 1 • PA 12 • MP 10 • CD 4
Dano: (weapon + STR0.8 + INT1.2); salta 1 vez (INT*0.6) se houver alvo adjacente.
Pré: 8

14. **Absorção Arcana** — instant — self
PA 9 • MP 0 • CD 6
Se sofrer magia até seu próximo turno: recupera MP igual a 40% do dano (cap 12).
Pré: 6

15. **Marca do Duelista** — instant — single
Range 6 • LoS sim • PA 9 • MP 8 • CD 4 • Dur 3
Alvo marcado: recebe +10% dano mágico e -10 RES.
Pré: 10

16. **Lâmina Fantasma** — passive — self
+1 range em ataques melee (só para skills marcadas GHOST_BLADE).
Pré: 7

17. **Reflexo Mágico** — instant — self
PA 12 • MP 14 • CD 7 • Dur 1
Reflete 1 magia single-target (50% dano de volta).
Pré: 14

18. **Transposição** — instant — single
Range 6 • LoS sim • PA 12 • MP 12 • CD 6
Troca de lugar com o alvo (se tile válido).
Teste: INT vs RES (falha: você só teleporta 2 tiles).
Pré: 15

19. **Chuva de Espadas** — cast — aoe
Range 8 • LoS sim • PA 18 • MP 16 • CD 7
Raio 2: (INT1.4 + weapon0.4) dano; aplica -10 AIM 1T.
Pré: 13

20. **Apocalipse Rúnico** — ultimate — aoe
Range 10 • LoS sim • PA 24 • MP 20 • CD 9
Grande raio 3: dano (INT2.2 + STR0.8) e ignora 20% armor.
Pré: 19

---

## GUERREIRO — MONGE (Mestre do Ki Interior) — 20 nós
1. **Punhos de Aço** — passive
Ataque desarmado usa (STR1.2 + AGI0.8) e conta como mágico.
Pré: Centro Guerreiro

2. **Ki: Fluxo** — passive
A cada 6 PA gastos em movimento no turno: +1 MP (cap 4).
Pré: 1

3. **Punho Vendaval** — instant — single
Range 1 • PA 6 • MP 0 • CD 1
Dano: (STR1.2 + AGI0.6).
Pré: 1

4. **Chute Voador** — instant — single
Range 4 • LoS sim • PA 12 • MP 4 • CD 3
Avança para alvo e causa (STR1.1 + AGI0.8).
Pré: 3

5. **Meditação** — sustain — self
PA 9 • MP 0 • CD 4
Recupera por turno: cura (VIT0.8) e MP (INT0.6). Imóvel. Quebra ao tomar dano (INT vs RES).
Pré: 2

6. **Palma Vibratória** — instant — single
Range 1 • PA 12 • MP 6 • CD 3
Dano: (STR0.8 + INT1.2) ignora 30% armor.
Pré: 3

7. **Sete Estrelas** — cast — single
Range 1 • PA 15 • MP 8 • CD 5
7 hits pequenos: total (STR1.6 + AGI1.0), cada hit tem -5 AIM.
Pré: 4

8. **Esquiva Perfeita** — instant — self
PA 9 • MP 6 • CD 6 • Dur 1
+40 EVA e reduz dano AoE em 30% por 1T.
Pré: 2

9. **Toque da Paralisia** — cast — single
Range 1 • PA 12 • MP 10 • CD 7 • Dur 1
Hard CC: stun 1T.
Teste: INT vs RES.
Pré: 6

10. **Grito Kiai** — instant — cone
Cone 3 • PA 12 • MP 8 • CD 5
Interrompe conjuração e aplica -10 AIM 1T.
Teste: INT vs RES (interromper).
Pré: 6

11. **Passo da Nuvem** — instant — utility
Range 6 • PA 12 • MP 8 • CD 4
Move ignorando terreno difícil; não gera AoO ao mover.
Pré: 4

12. **Pele de Ferro** — sustain — self
PA 9 • MP 5/turn • CD 5
+25% armor; -10 AIM.
Pré: 8

13. **Contra-Arremesso** — instant — single
Range 1 • PA 12 • MP 0 • CD 4
Se alvo te atacou melee desde seu último turno: dano (STR*1.4) e knockback 2 tiles.
Pré: 12

14. **Explosão de Chi** — instant — single
Range 8 • LoS sim • PA 12 • MP 10 • CD 4
Dano: (INT1.8 + AGI0.4).
Pré: 10

15. **Mantra da Purificação** — cast — ally
Range 6 • PA 9 • MP 10 • CD 6
Remove 2 debuffs e cura (VIT0.6 + INT0.8).
Pré: 5

16. **Lótus Giratória** — instant — aoe
Raio 1 • PA 15 • MP 6 • CD 5
Dano: (STR1.1 + AGI0.6) e aplica slow 1T (Teste INT vs RES).
Pré: 7

17. **Ponto de Pressão** — instant — single
Range 1 • PA 12 • MP 8 • CD 6 • Dur 1
Alvo não pode usar skills no próximo turno (silence de habilidades).
Teste: INT vs RES.
Pré: 9

18. **Espírito do Tigre** — instant — self
PA 9 • MP 10 • CD 7 • Dur 2
+20% crit e +10 AIM por 2T.
Pré: 16

19. **Corpo Etéreo** — instant — self
PA 12 • MP 14 • CD 8 • Dur 1
Reduz dano físico recebido em 70% por 1T; não pode atacar, só mover.
Pré: 12

20. **Nirvana** — ultimate — self
PA 24 • MP 18 • CD 10
1x por missão: se morrer, revive no início do próximo turno com 35% HP e 15 PA.
Pré: 19

---

# ARCANO

## ARCANO — ELEMENTAL (com variantes Fogo/Água/Gelo/Vento/Terra/Eletricidade) — 20 nós
1. **Afinidade Elemental** — passive
Escolhe 1 elemento “ativo”; skills elementais ganham +10% dano e +10 RES vs seu elemento. Pode trocar fora do combate.
Pré: Centro Arcano

2. **Canal Elemental** — passive
Ao lançar magia elemental: +1 stack Canal (cap 6). Cada stack: -1 MP do próximo cast (cap -6).
Pré: 1

3. **Projétil Elemental** — instant — single
Range 10 • PA 9 • MP 6 • CD 1
Dano: (INT*1.6). Elemento depende da afinidade.
Pré: 1

4. **Explosão Elemental** — cast — aoe
Range 8 • PA 15 • MP 12 • CD 4
Raio 2: dano (INT*1.8).
Pré: 3

5. **Escudo Elemental** — instant — ally
Range 6 • PA 9 • MP 10 • CD 5 • Dur 2
Escudo: (INT*1.4). Variante: Fogo reflete 10%, Água dá HoT, Gelo dá +armor, Vento dá +EVA, Terra dá +RES, Eletricidade dá +AIM.
Pré: 3

6. **Campo Elemental** — sustain — aoe
Range 6 • PA 12 • MP 6/turn • CD 6
Raio 2 persistente: aplica efeito do elemento (burn/regen/freeze stacks/haste/slow/chain). Imóvel ao manter.
Pré: 4

7. **Controle: Quase-Hard** — cast — single
Range 8 • PA 12 • MP 12 • CD 6 • Dur 1
Efeito conforme elemento: Fogo (fear leve), Água (silence), Gelo (root), Vento (disarm leve), Terra (prone), Eletricidade (stun 1T).
Teste: INT vs RES (se falha, vira slow 1T).
Pré: 4

8. **Passo Elemental** — instant — utility
Range 6 • PA 12 • MP 10 • CD 4
Teleporte curto; deixa “rastro” do seu elemento no tile (1T).
Pré: 5

9. **Aura de Afinidade** — sustain — self
PA 9 • MP 4/turn • CD 5
Buff pessoal por elemento: Fogo +dmg, Água +heal, Gelo +armor, Vento +EVA, Terra +RES, Eletricidade +AIM.
Pré: 5

10. **Parede Elemental** — sustain — utility
Range 6 • PA 15 • MP 8/turn • CD 6 • Dur sustain
Cria parede 5 tiles (ex.: Parede de Fogo). Quem atravessa toma (INT*1.2) e status. Imóvel.
Quebra se tomar dano (INT vs RES).
Pré: 6

11. **Amplificar** — instant — self
PA 9 • MP 12 • CD 6 • Dur 2
+15% dano elemental, mas +10% MP cost.
Pré: 9

12. **Reação Elemental** — instant — single
Range 8 • PA 12 • MP 10 • CD 5
Se alvo tiver status do seu elemento (burn/wet/frost/gust/stone/static): dano extra + (INT*1.2).
Pré: 7

13. **Zona de Tempestade** — cast — aoe
Range 8 • PA 18 • MP 16 • CD 7 • Dur 2
Raio 3: dano por turno (INT*1.1) + debuff leve.
Pré: 10

14. **Dissipar Afinidade** — instant — aoe
Range 6 • PA 12 • MP 14 • CD 6
Remove 1 buff inimigo; se remover, aplica status elemental 1T (Teste INT vs RES).
Pré: 11

15. **Avatar Elemental (pré-forma)** — cast — self
PA 12 • MP 16 • CD 8 • Dur 2
Ganha resistência alta ao elemento e +10 PA_max por 2T.
Pré: 13

16. **Invocar Núcleo Elemental** — cast — utility
Range 6 • PA 15 • MP 14 • CD 7 • Dur 3
Totem que lança projéteis (INT*0.8).
Pré: 13

17. **Ruptura** — instant — aoe
Range 8 • PA 15 • MP 14 • CD 6
Explode status em área: cada inimigo com status toma + (INT*0.9).
Pré: 12

18. **Concentração Perfeita** — passive
+20% chance de manter sustain após dano (bônus no teste INT vs RES).
Pré: 10

19. **Coração do Elemento** — passive
+10 INT, +10 RES; e seu elemento aplica status +1 turno (cap 3).
Pré: 18

20. **AVATAR ELEMENTAL** — ultimate — self
PA 24 • MP 22 • CD 10 • Dur 3
Transforma: +25% dano elemental, +20 RES, e “Campo Elemental” gratuito (sem MP/turn) ativo ao redor (raio 2). Ao fim: Exausto 2T (-10 PA).
Pré: 19

---

## ARCANO — GRAVITACIONAL (Dobrador do Espaço / Singularidade Viva) — 20 nós
1. **Peso do Mundo** — passive — self
Inimigos a 3 tiles: -1 tile de move (soft). Pré: Centro Arcano.

2. **Micro-Gravidade** — passive — self
+10 EVA e ignora terreno difícil ao mover 2+ tiles no turno. Pré: 1

3. **Puxão Gravitacional** — cast — single — PA12 MP10 CD4
Range 8. Puxa alvo 3 tiles (se possível). Teste: INT vs FORT. Pré: 1

4. **Repulsão** — cast — aoe — PA12 MP10 CD4
Raio 2 em você: empurra 2 tiles. Teste: INT vs FORT. Pré: 1

5. **Esfera Pesada** — cast — aoe — PA15 MP12 CD6 Dur2
Range 8. Área raio 2: custo de move +3 PA por tile dentro. Pré: 3

6. **Levitação Hostil** — cast — single — PA12 MP12 CD6 Dur1
Range 8. Alvo “flutua”: -15 AIM e -15% armor 1T (boss: -10 AIM). Teste INT vs RES. Pré: 3

7. **Esmagamento** — instant — single — PA12 MP12 CD5
Range 8. Dano: INT*1.8 e aplica slow (-1 tile) 1T. Pré: 6

8. **Órbita de Detritos** — sustain — self — PA9 MP5/turn CD5
Por turno: dano em adjacentes INT*0.7; projéteis contra você sofrem -10 AIM. Pré: 2

9. **Buraco Negro Menor** — cast — utility — PA15 MP14 CD7 Dur2
Range 8. “Suga projéteis” (50% chance de cancelar tiros que cruzem o tile central). Pré: 5

10. **Inverter Gravidade** — cast — aoe — PA18 MP16 CD7
Range 8 raio 2. Inimigos tomam dano de impacto INT*1.2 e ficam prone 1T (boss: slow 1T). Teste INT vs FORT. Pré: 5

11. **Densidade Zero** — instant — self — PA9 MP10 CD6 Dur2
+25 EVA e -3 PA custo de mover por 2T. Pré: 2

12. **Poço de Gravidade** — cast — aoe — PA15 MP14 CD7 Dur2
Range 8 raio 2. “Não pode sair” (root ao tentar sair). Teste INT vs FORT. Pré: 5

13. **Dobra Espacial** — instant — utility — PA12 MP14 CD6
Teleporte 8 tiles (LoS sim). Pré: 9

14. **Vínculo Gravitacional** — cast — utility — PA12 MP12 CD6 Dur3
Range 8. Linka 2 inimigos: 30% do dano recebido por um replica no outro. Teste INT vs RES. Pré: 12

15. **Horizonte de Eventos** — cast — aoe — PA15 MP14 CD7 Dur2
Range 8 raio 2: projéteis “congelam”: -50% velocidade e -15 AIM; magias cast dentro custam +4 MP. Pré: 9

16. **Colapso de Armadura** — instant — single — PA12 MP12 CD6 Dur3
Range 8. Debuff: -20% armor por 3T. Teste INT vs RES. Pré: 7

17. **Estrela de Nêutrons** — sustain — aoe — PA18 MP10/turn CD8
Imóvel. Aura raio 2: dano por turno INT*1.3 e -1 tile move. Concentração ao tomar dano. Pré: 15

18. **Ancorar** — cast — aoe — PA12 MP14 CD7 Dur2
Range 8 raio 2: impede teleport/salto e cancela invis. Pré: 12

19. **Maré Gravitacional** — cast — aoe — PA18 MP16 CD8 Dur2
Range 10 raio 3: no início do turno puxa 1 tile, no fim empurra 1 tile (desorganiza formações). Teste INT vs FORT. Pré: 15

20. **SINGULARIDADE VIVA** — ultimate — aoe — PA24 MP22 CD10
Range 10 raio 3 por 2T: puxa 2 tiles/turno e dano INT*2.2 total por turno (dividido). Ao acabar explode: INT*1.6. Pré: 19

---

## ARCANO — TEMPORAL (Cronomante / Eco do Futuro) — 20 nós
1. **Déjà Vu** — passive — self
10% chance de repetir magia instantânea sem custo (não repete ultimate). Pré: Centro Arcano

2. **Marca de Iniciativa** — passive — self
No 1º turno do combate: +6 PA. Pré: 1

3. **Haste** — cast — ally — PA12 MP10 CD5 Dur2
Range 8. +1 tile move e +3 PA por 2T. Pré: 1

4. **Slow** — cast — single — PA12 MP10 CD5 Dur2
Range 8. -1 tile move e -3 PA por 2T. Teste INT vs RES. Pré: 1

5. **Parar Tempo** — cast — single — PA15 MP16 CD8 Dur1
Range 8. Stun 1T (boss: slow 1T + -6 PA). Teste INT vs RES. Pré: 4

6. **Rebobinar** — cast — ally — PA12 MP14 CD7
Range 8. Alvo retorna à posição do turno anterior (se tile livre) e cura INT*1.2. Pré: 3

7. **Corte Temporal** — instant — single — PA9 MP8 CD3
Range 8. Dano atrasado: no início do próximo turno do alvo, toma INT*1.8. Pré: 1

8. **Campo de Estase** — cast — aoe — PA18 MP16 CD8 Dur2
Range 8 raio 2. Quem entra: -6 PA no turno e não pode sprintar. Pré: 4

9. **Eco do Futuro** — cast — utility — PA12 MP14 CD7 Dur2
“Armazena” sua próxima magia instant; ela dispara automaticamente após 2 turnos com +25% dano. Pré: 7

10. **Roubar Tempo** — instant — single — PA12 MP12 CD6
Range 8. Você ganha +3 PA, alvo perde -3 PA (cap). Teste INT vs RES. Pré: 4

11. **Resetar** — cast — ally — PA12 MP16 CD8
Range 6. Zera CD de 1 skill não-ultimate do aliado. Pré: 3

12. **Decadência** — cast — single — PA12 MP12 CD6 Dur3
Range 8. DoT crescente: INT*0.6, INT*0.9, INT*1.2. Pré: 7

13. **Salto no Tempo** — cast — self — PA12 MP14 CD9
Você “some” 1T (invulnerável), volta no próximo turno com cura INT*1.4. Pré: 6

14. **Duplicata Temporal** — cast — utility — PA15 MP14 CD7 Dur2
Invoca clone 1 HP que repete seu último ataque básico 1x/turno. Pré: 9

15. **Congelar Momento** — instant — utility — PA9 MP12 CD7 Dur2
Pausa duração de buffs/debuffs em área raio 2 (ninguém ganha/ perde stack) por 2T. Pré: 8

16. **Precognição** — cast — self — PA12 MP12 CD7 Dur2
+15 AIM, +15 EVA por 2T. Pré: 2

17. **Loop** — cast — single — PA15 MP16 CD8
Range 8. Alvo repete “última ação” no próximo turno (se possível), senão perde 6 PA. Teste INT vs RES. Pré: 10

18. **Paradoxo** — cast — single — PA12 MP14 CD7 Dur2
Se alvo te atacar, recebe 40% do dano de volta (true). Pré: 10

19. **Cronosfera** — cast — aoe — PA18 MP18 CD9 Dur2
Range 8 raio 2: inimigos dentro agem por último e -6 PA; aliados +3 PA. Pré: 15

20. **CRONOMANTE SUPREMO** — ultimate — utility — PA24 MP22 CD10
Por 2T: só você “age normal”; inimigos recebem -10 PA e -1 tile move; você ganha +6 PA. Pré: 19

---

## ARCANO — ARTES DAS TREVAS (Arauto do Abismo) — 20 nós
1. **Aura de Demência** — passive — self
Inimigos adjacentes: -2 MP (ou -2 “energia”) por turno e ganham 1 stack Instabilidade (cap 5). Pré: Centro Arcano

2. **Instabilidade Crescente** — passive
Cada stack no alvo: ele recebe +3% dano de trevas. Pré: 1

3. **Seta Sombria** — instant — single — PA9 MP6 CD1
Range 10. Dano: INT*1.6. Pré: 1

4. **Toque da Corrupção** — cast — single — PA12 MP10 CD5 Dur3
Range 8. DoT INT*0.8/turn e “anti-heal” 50%. Teste INT vs RES. Pré: 3

5. **Medo Primal** — cast — single — PA12 MP12 CD6 Dur1
Range 8. Fear 1T (boss: -10 AIM 1T). Teste INT vs RES. Pré: 3

6. **Tentáculos do Abismo** — cast — aoe — PA15 MP12 CD6 Dur2
Range 8 raio 2: dano INT*1.0/turn + root ao pisar (teste INT vs FORT). Pré: 4

7. **Cegueira Noturna** — cast — single — PA12 MP10 CD6 Dur2
Range 8. -15 AIM e -10 vision range. Teste INT vs RES. Pré: 4

8. **Vínculo de Dor** — cast — single — PA12 MP12 CD6 Dur3
30% do dano que você receber vai pro alvo (true). Pré: 6

9. **Explosão de Cadáver** — cast — aoe — PA15 MP14 CD7
Range 8. Em cadáver: raio 2 dano INT*2.0. Pré: 6

10. **Sussurros Loucos** — cast — single — PA12 MP12 CD7 Dur2
Alvo tem 35% de “errar ação” (perde 6 PA) por 2T. Teste INT vs RES. Pré: 5

11. **Manto das Sombras** — instant — self — PA9 MP12 CD7 Dur1
70% redução dano físico 1T; não pode atacar. Pré: 7

12. **Lança do Vazio** — cast — single — PA15 MP14 CD7
Range 12. Atravessa 1 parede fina. Dano INT*2.2 e ignora 20% RES. Pré: 9

13. **Dreno Mental** — cast — single — PA12 MP10 CD6
Range 8. Dano INT*1.4 e você recupera MP igual a 40% do dano. Pré: 8

14. **Pesadelo Vivo** — cast — utility — PA15 MP14 CD8 Dur2
Invoca “ilusão” no tile do alvo: aplica -10 AIM e -10 EVA; sofre INT*0.8/turn. Teste INT vs RES. Pré: 10

15. **Poço de Escuridão** — sustain — aoe — PA18 MP8/turn CD8
Range 8 raio 3: inimigos dentro -10 vision e recebem +15% dano de trevas. Imóvel. Pré: 12

16. **Marca da Perdição** — cast — single — PA12 MP12 CD7 Dur3
Se alvo morrer marcado: explode (raio 2) INT*1.6. Pré: 12

17. **Possessão Menor** — cast — single — PA15 MP16 CD9 Dur1
Você escolhe o movimento do alvo no próximo turno (sem atacar). Teste INT vs RES. Pré: 14

18. **Forma de Espectro** — instant — self — PA12 MP14 CD8 Dur2
Atravessa unidades/obstáculos leves; +20 EVA; não pode capturar objetivos. Pré: 11

19. **Silêncio do Vazio** — cast — single — PA12 MP12 CD7 Dur1
Impede skills mágicas 1T. Teste INT vs RES. Pré: 7

20. **ECLIPSE TOTAL** — ultimate — aoe — PA24 MP22 CD10 Dur2
Mapa “escurece”: inimigos -10 AIM/-10 vision e tomam INT*2.0 total por turno; você cura INT*1.0/turn. Pré: 15

---

## ARCANO — ARTES DA LUZ (Avatar da Esperança) — 20 nós
1. **Proteção Divina** — passive
Overheal vira escudo (50% do excesso), dura até o fim do combate (cap por alvo: INT*3). Pré: Centro Arcano

2. **Bênção Persistente** — passive
Curas também dão +5 RES por 1T. Pré: 1

3. **Raio de Luz** — instant — single — PA9 MP6 CD1
Range 10. Em inimigo: dano INT*1.6. Em aliado: cura INT*1.4. Pré: 1

4. **Batismo** — cast — ally — PA12 MP10 CD5
Range 8. Remove 2 debuffs. Cura INT*0.8. Pré: 3

5. **Escudo Divino** — cast — ally — PA12 MP12 CD5 Dur2
Escudo INT*1.8. Pré: 3

6. **Martelo da Justiça** — cast — single — PA12 MP12 CD6 Dur1
Range 8. Dano INT*1.4 + stun 1T (boss: -6 PA). Teste INT vs RES. Pré: 3

7. **Correntes de Luz** — cast — single — PA12 MP12 CD6 Dur2
Root 2T e impede teleport. Teste INT vs RES. Pré: 6

8. **Santuário** — cast — aoe — PA15 MP14 CD7 Dur3
Range 8 raio 2: cura por turno INT*0.8 + +10 RES. Pré: 5

9. **Bênção do Valor** — cast — ally — PA12 MP10 CD6 Dur2
+10 AIM e +10% dano por 2T. Pré: 4

10. **Cegar o Mal** — cast — cone — PA15 MP12 CD6 Dur1
Cone 4. Cegueira 1T (-20 AIM). Teste INT vs RES. Pré: 6

11. **Ressurreição** — cast — ally — PA18 MP18 CD9
Range 6. Revive com 25% HP. (Se não existe morte ainda no seu sistema, vira “levanta caído”). Pré: 8

12. **Julgamento** — cast — aoe — PA18 MP16 CD7
Range 10 raio 2: dano INT*2.0 (dobro contra undead/demons se existir). Pré: 8

13. **Asas de Serafim** — instant — self — PA12 MP12 CD7 Dur2
Voo 2T (ignora terreno) +10 EVA. Pré: 9

14. **Intervenção** — instant — ally — PA12 MP14 CD8
Range 8. Se aliado cair a 0 HP até seu próximo turno: fica com 1 HP e teleporta 3 tiles (se possível). Pré: 11

15. **Consagração** — sustain — aoe — PA15 MP8/turn CD8 Dur sustain
Range 6 raio 2: inimigos tomam INT*1.0/turn; aliados curam INT*0.6/turn. Imóvel. Pré: 8

16. **Reflexo Sacro** — cast — ally — PA12 MP14 CD8 Dur2
50% dano mágico refletido (cap). Pré: 5

17. **Palavra de Poder: Pare** — cast — single — PA15 MP16 CD9 Dur1
Skip-turn 1T (boss: -10 PA). Teste INT vs RES. Pré: 6

18. **Purgar** — instant — aoe — PA12 MP14 CD7
Range 8 raio 2: remove 1 buff de cada inimigo; se remover, aplica -5 RES 1T. Pré: 16

19. **Vínculo de Vida** — cast — utility — PA15 MP14 CD8 Dur2
Por 2T: 25% do dano tomado por um aliado distribui pelo time. Pré: 14

20. **AVATAR DA ESPERANÇA** — ultimate — aoe — PA24 MP22 CD10
Cura total do time (cap: INT*6 se quiser limitar), remove debuffs, concede escudo INT*2.5. Você fica “Iluminado” 2T (+10 RES, +10 AIM). Pré: 19

---

## ARCANO — NECROMANTE (Ceifador de Almas) — 20 nós
1. **Colheita de Essência** — passive
Morte a 5 tiles: +3 MP e 1 stack Essência (cap 6). Pré: Centro Arcano

2. **Essência Potente** — passive
Cada stack: +2% dano trevas e +2% cura de dreno. Pré: 1

3. **Lança de Osso** — instant — single — PA9 MP6 CD1
Range 10. Dano INT*1.3 + DEX*0.6. Aplica bleed leve 2T (teste INT vs RES). Pré: 1

4. **Levantar Esqueleto** — cast — summon — PA12 MP12 CD4 Dur3
Invoca esqueleto fraco (1 ação/turno). Limite 1 (vira 2 com skill 12). Pré: 1

5. **Dreno de Vida** — sustain — single — PA12 MP6/turn CD6
Range 8. Por turno: dano INT*1.1 e cura você 60% disso. Imóvel. Pré: 3

6. **Muralha de Ossos** — cast — utility — PA15 MP14 CD7 Dur3
Cria parede 3 tiles (cobertura total). Pré: 4

7. **Explodir Servo** — instant — aoe — PA12 MP8 CD4
Detona invocação: raio 2 dano INT*1.8. Pré: 4

8. **Praga Contagiosa** — cast — single — PA12 MP12 CD6 Dur3
DoT INT*0.7/turn; se alvo terminar turno adjacente a outro, espalha 1 vez. Teste INT vs RES. Pré: 5

9. **Maldição da Fraqueza** — cast — single — PA12 MP10 CD6 Dur3
-10% dano e -10% armor por 3T. Teste INT vs RES. Pré: 8

10. **Prisão de Costelas** — cast — single — PA12 MP12 CD7 Dur1
Root 1T + -10 AIM. Teste INT vs FORT. Pré: 6

11. **Nuvem Tóxica** — cast — aoe — PA15 MP14 CD7 Dur2
Range 8 raio 2: -10 vision e veneno INT*0.6/turn. Pré: 8

12. **Mago Esqueleto** — cast — summon — PA12 MP14 CD6 Dur3
Invoca ranged caster (dano INT*0.7/turn). Limite +1 summon total. Pré: 4

13. **Armadura Óssea** — cast — self — PA12 MP12 CD7 Dur2
Escudo INT*1.6 + +10 armor. Pré: 6

14. **Caminho da Sepultura** — instant — utility — PA12 MP10 CD6
Teleporta para um cadáver a até 10 tiles (LoS não). Pré: 9

15. **Dominar Morto-Vivo** — cast — single — PA15 MP16 CD9 Dur2
Controla undead inimigo 2T (se existir); senão: aplica fear+slow. Teste INT vs RES. Pré: 12

16. **Decomposição Acelerada** — cast — single — PA12 MP12 CD7 Dur3
-25% armor por 3T. Teste INT vs RES. Pré: 9

17. **Foice da Morte** — instant — single — PA12 MP10 CD5
Range 1. Dano INT*1.2 + STR*0.8; se alvo <20% HP: +50% dano. Pré: 5

18. **Golém de Carne** — cast — summon — PA18 MP18 CD9 Dur3
Invoca tank (taunt leve). Limite 1. Pré: 12

19. **Pacto do Lich** — passive
1x por missão: se morrer, um summon permanece e você volta com 20% HP após 1 turno (se tiver summon vivo). Pré: 18

20. **EXÉRCITO DOS MORTOS** — ultimate — aoe+summon — PA24 MP22 CD10 Dur3
Levanta até 3 cadáveres como zumbis (fracos) por 3T; inimigos em 5 tiles tomam fear leve (teste INT vs RES). Pré: 19

---

## ARCANO — INVOCADOR (Portador do Avatar) — 20 nós
1. **Vínculo Mestre** — passive
Invocações +20% HP; se você não atacar no turno, pet ganha +1 ação simples. Pré: Centro Arcano

2. **Comando Básico** — passive
Pets ganham +10 AIM e +10 RES. Pré: 1

3. **Invocar Elemental Menor** — cast — summon — PA12 MP12 CD4 Dur3
Escolhe Fogo/Água/Terra/Ar (kit simples). Pré: 1

4. **Invocar Besta Guardiã** — cast — summon — PA12 MP12 CD4 Dur3
Urso (tank) ou Lobo (dps). Pré: 1

5. **Curar Invocação** — instant — ally — PA9 MP8 CD3
Range 8. Cura INT*1.6. Pré: 3

6. **Enfurecer** — cast — ally — PA12 MP10 CD5 Dur2
Pet: +20% dano, +10% dano recebido. Pré: 4

7. **Troca Dimensional** — instant — utility — PA12 MP12 CD6
Troca posição com pet (LoS sim). Pré: 3

8. **Proteger** — sustain — ally — PA9 MP5/turn CD6
Pet intercepta 1 ataque por turno em você. Pré: 4

9. **Vínculo de Alma** — sustain — self — PA9 MP6/turn CD7
50% do dano em você vai pro pet. Imóvel? não. (Sustain sem imobilizar, mas quebra ao pet morrer). Pré: 8

10. **Sacrifício de Mana** — instant — utility — PA9 MP0 CD7
Desinvoca pet e recupera 60% MP max. Pré: 5

11. **Portal do Bestiário** — cast — summon — PA15 MP14 CD8 Dur1
Invoca 3 criaturas fracas por 1T (distração). Pré: 4

12. **Evolução Temporária** — cast — ally — PA12 MP14 CD7 Dur2
Pet +25% HP, +15% dano, +1 tile move. Pré: 6

13. **Ataque Combinado** — instant — single — PA12 MP10 CD6
Você e pet atacam mesmo alvo: dano total INT*0.8 + pet*1.0. Pré: 6

14. **Invocar Sentinela** — cast — summon — PA15 MP14 CD7 Dur3
Torre imóvel que atira em quem passar (dano INT*0.8). Pré: 3

15. **Grito da Natureza** — cast — aoe — PA12 MP12 CD7 Dur1
Range 0 raio 2 no pet: fear leve ou stun 1T (teste INT vs RES). Pré: 4

16. **Mimetismo** — instant — self — PA9 MP10 CD7 Dur2
Você ganha 50% das resistências do pet por 2T. Pré: 9

17. **Teleporte do Mestre** — instant — utility — PA12 MP12 CD6
Teleporta pet até 8 tiles (LoS sim). Pré: 7

18. **Fusão de Almas** — cast — self — PA15 MP16 CD9 Dur2
Absorve o pet: ganha +10 STR/DEX/AGI/VIT/INT (ou +15% stats) por 2T; pet some. Pré: 16

19. **Invocação: Fênix** — cast — summon — PA18 MP18 CD9 Dur3
Pet voador: cura aliados adjacentes INT*0.6/turn e renasce 1x (50% HP). Pré: 12

20. **PORTADOR DO AVATAR** — ultimate — summon — PA24 MP22 CD10 Dur3
Invoca “Avatar Colossal” (1) com ataque em área por turno INT*2.0 e taunt forte. Pré: 19

---

# ARQUEIRO

## ARQUEIRO — OLHO DE ÁGUIA (Sniper) — 20 nós
1. **Mira de Longo Alcance** — passive
+2 range em ataques básicos e -10% queda de precisão por distância.
Pré: Centro Arqueiro

2. **Tiro Preciso** — cast — single
Range 14 • LoS sim • PA 12 • MP 0 • CD 2
Dano: (weapon + DEX*1.8).
Pré: 1

3. **Sentinela Divina** — instant — utility
Range 0 • PA 9 • MP 8 • CD 6 • Dur 3
Revela inimigos em 8 tiles e remove stealth.
Pré: 1

4. **Flecha Guiada** — instant — single
Range 12 • PA 9 • MP 4 • CD 3
Não erra (ignora evasão), dano: (weapon0.8 + DEX1.2).
Pré: 2

5. **Tiro na Cabeça** — cast — single
Range 14 • PA 15 • MP 6 • CD 5
Dano: (weapon + DEX*2.2). Crit +20%.
Pré: 2

6. **Camuflagem** — sustain — self
PA 9 • MP 4/turn • CD 5
Invisível se não mover; primeiro tiro do stealth +15 AIM. Quebra se tomar dano.
Pré: 3

7. **Tiro Perfurante** — instant — line
Range 12 • PA 12 • MP 6 • CD 4
Linha 6: atravessa 2 alvos. Dano: (weapon0.9 + DEX1.4).
Pré: 2

8. **Desarmar** — instant — single
Range 10 • PA 12 • MP 6 • CD 6 • Dur 1
Debuff: -30% weapon_power 1T.
Teste: DEX vs FORT.
Pré: 7

9. **Foco Absoluto** — sustain — self
PA 9 • MP 5/turn • CD 6
Imóvel; +15 AIM e +15% crit.
Pré: 5

10. **Observador de Fraqueza** — instant — self
PA 6 • MP 6 • CD 5 • Dur 1
Próximo ataque ignora 25% armor.
Pré: 5

11. **Tiro Ricochete** — instant — single
Range 12 • PA 12 • MP 8 • CD 5
Ignora 50% cover (ricochete). Dano: (weapon + DEX*1.5).
Pré: 10

12. **Flecha Fantasma** — cast — single
Range 12 • PA 15 • MP 12 • CD 6
Atravessa 1 parede fina. Dano: (DEX1.8 + INT0.8).
Pré: 11

13. **Posição Elevada** — passive
Se estiver em altura maior: +10 AIM e +10% dano.
Pré: 1

14. **Tiro de Sangramento** — instant — single
Range 12 • PA 12 • MP 4 • CD 4 • Dur 3
Dano: (weapon + DEX1.2) + bleed (DEX0.5)/turn.
Pré: 7

15. **Flecha Ancoradoura** — instant — single
Range 10 • PA 12 • MP 8 • CD 6 • Dur 2
Impede teleporte e -2 tiles move.
Teste: DEX vs RES.
Pré: 8

16. **Olhos de Falcão** — cast — aoe allies
Range 0 (raio 6) • PA 12 • MP 12 • CD 7 • Dur 2
+10 AIM para aliados.
Pré: 3

17. **Tiro de Execução** — instant — single
Range 14 • PA 15 • MP 8 • CD 5
Se alvo <30% HP: dano (weapon + DEX*2.6).
Pré: 14

18. **Marca do Alvo** — instant — single
Range 14 • PA 9 • MP 8 • CD 5 • Dur 3
Alvo marcado: recebe +10% dano ranged.
Pré: 16

19. **Disciplina do Sniper** — passive
-2 PA no custo de “cast” de sniper (min 9).
Pré: 13

20. **Chuva de Uma Flecha Só** — ultimate — aoe
Range 14 • PA 24 • MP 18 • CD 10
Raio 3: dano (DEX2.2 + weapon0.6) dividido em múltiplos hits; aplica -10 AIM 1T.
Pré: 19

---

## ARQUEIRO — CURTO ALCANCE (Predador Ágil / Tempestade de Flechas) — 20 nós
1. **Atirar em Melee** — passive
Sem penalidade de precisão atirando adjacente. Pré: Centro Arqueiro

2. **Disparo em Movimento** — instant — single — PA9 MP0 CD2
Range 6. Atira (dano weapon + DEX*1.2) e pode mover 1 tile grátis. Pré: 1

3. **Salto Evasivo** — instant — utility — PA12 MP6 CD4
Recuar 2 tiles (sem AoO) e ganha +10 EVA 1T. Pré: 2

4. **Tempestade de Flechas** — cast — single — PA15 MP6 CD5
Range 6. 5 tiros: total weapon*2.2 + DEX*1.6 (dividido). Pré: 2

5. **Chute e Tiro** — instant — single — PA12 MP0 CD4
Range 1. Empurra 1 tile + atira (dano weapon + DEX*1.0). Teste DEX vs FORT. Pré: 2

6. **Flecha de Rede** — instant — single — PA12 MP8 CD6 Dur1
Range 6. Root 1T (boss: -1 tile). Teste DEX vs RES. Pré: 4

7. **Disparo Leque** — instant — aoe (cone) — PA15 MP6 CD5
Cone 3. Dano weapon*0.8 + DEX*1.2. Pré: 4

8. **Rolamento Tático** — instant — self — PA9 MP6 CD5
Move 3 tiles (ignora terreno) e recarrega 1 skill (reduz CD em 1). Pré: 3

9. **Flechas Envenenadas** — sustain — self — PA9 MP4/turn CD6
Ataques aplicam veneno DEX*0.5/turn (2T). Imóvel? não, mas quebra por concentração se tomar dano (teste). Pré: 6

10. **Golpe de Arco** — instant — single — PA9 MP0 CD2
Range 1. Dano STR*0.8 + AGI*0.6 + weapon*0.5. Pré: 1

11. **Ataque de Flanco** — passive
Se atacar alvo fora do cone frontal dele: +15% dano. Pré: 10

12. **Corrida do Vento** — instant — self — PA9 MP8 CD6 Dur1
+3 tiles move por 1T e -1 PA por tile (min 2). Pré: 8

13. **Disparo 360** — instant — aoe — PA15 MP8 CD7
Atira 1 vez em cada inimigo adjacente (máx 4): cada tiro weapon*0.7 + DEX*0.6. Pré: 10

14. **Flecha Adaga** — instant — single — PA12 MP6 CD5 Dur3
Range 6. Dano weapon + DEX*1.0 + bleed DEX*0.6/turn. Pré: 9

15. **Acrobacia** — passive
Ignora penalidade de altura/terreno no custo de move (MVP: -1 PA por tile difícil). Pré: 12

16. **Tiro Duplo** — instant — single — PA12 MP4 CD3
Dois tiros: cada weapon*0.75 + DEX*0.9. Pré: 4

17. **Reflexos Rápidos** — passive
1x/turn: se inimigo atirar em você e errar, você ganha +3 PA. Pré: 15

18. **Hit & Run** — passive
Se matar com ataque ranged: +1 tile move grátis. Pré: 16

19. **Bombardeio Improvisado** — cast — aoe — PA18 MP12 CD8
Range 8 raio 2: dano DEX*1.0 + INT*0.8. Pré: 7

20. **DANÇA DA MORTE** — ultimate — aoe — PA24 MP18 CD10
Atira 1 vez em todos inimigos visíveis (máx 6): cada tiro weapon*0.8 + DEX*0.9. Pré: 19

---

## ARQUEIRO — BESTAS (Artilheiro Pesado / Explosivos) — 20 nós
1. **Penetração Pesada** — passive
Ignora 10% armor em ataques de besta. Pré: Centro Arqueiro

2. **Disparo Poderoso** — instant — single — PA12 MP0 CD3
Range 10. Dano weapon + DEX*1.6 + knockback 1 tile (teste DEX vs FORT). Pré: 1

3. **Flecha Explosiva** — cast — aoe — PA15 MP10 CD5
Range 10 raio 2. Dano DEX*1.3 + INT*0.7. Pré: 2

4. **Recarga Rápida** — passive
-1 CD em skills de “besta” (mín 2). Pré: 1

5. **Tiro de Supressão** — cast — aoe — PA15 MP8 CD6 Dur1
Range 10 linha/área 3 tiles: inimigos dentro -10 AIM 1T. Pré: 2

6. **Quebra-Escudos** — instant — single — PA12 MP6 CD6
Range 10. Remove escudo (se tiver) e causa DEX*1.4. Pré: 3

7. **Bunker Pessoal** — cast — utility — PA12 MP10 CD7 Dur2
Cria cobertura parcial no seu tile (+cover bônus), -1 tile move. Pré: 5

8. **Metralha Pesada** — cast — single — PA18 MP8 CD7
Range 10. 4 tiros: total weapon*2.4 + DEX*1.2 com -10 AIM. Pré: 4

9. **Tiro de Morteiro** — cast — aoe — PA18 MP12 CD8
Range 14 raio 2 (LoS não, mas precisa “spot”): dano DEX*1.4 + INT*0.8. Pré: 3

10. **Flecha Arpão** — instant — single — PA12 MP8 CD6
Range 8. Puxa alvo 2 tiles OU puxa você até parede. Teste DEX vs FORT. Pré: 2

11. **Munição Pesada** — sustain — self — PA9 MP5/turn CD7
+20% dano, -2 range. Concentração ao tomar dano. Pré: 8

12. **Armadilha de Gatilho** — cast — utility — PA12 MP10 CD7 Dur3
Coloca tile-trap: primeiro inimigo que pisar toma DEX*1.4 e slow 1T. Pré: 5

13. **Tiro de Impacto** — instant — single — PA12 MP8 CD7 Dur1
Range 10. Stun 1T (boss: -6 PA). Teste DEX vs RES. Pré: 8

14. **Flecha de Fumaça** — cast — aoe — PA12 MP10 CD7 Dur2
Range 10 raio 2: cria “smoke” +cover e -vision. Pré: 7

15. **Estabilizar** — sustain — self — PA9 MP4/turn CD6
Imóvel; +15 AIM. Pré: 7

16. **Tiro no Chão** — cast — aoe — PA12 MP8 CD6 Dur2
Range 10 raio 2: terreno difícil (+3 PA/tile). Pré: 14

17. **Caçador de Grandes Presas** — passive
+15% dano em inimigos com HP máximo alto (elite/boss). Pré: 11

18. **Flecha Ácida** — cast — single — PA12 MP10 CD6 Dur3
Range 10. Dano DEX*1.0 + INT*0.8 e -20% armor 3T. Teste INT vs RES. Pré: 6

19. **Baioneta** — instant — single — PA9 MP0 CD3
Range 1. Dano STR*1.2 + weapon*0.6. Pré: 10

20. **BIG BERTHA** — ultimate — aoe — PA24 MP18 CD10
Range 14 raio 3: dano DEX*2.0 + INT*1.2 + prone (teste vs FORT). Pré: 17

---

# MERCENÁRIO

## MERCENÁRIO — ASSASSINO (Ceifador das Sombras) — 20 nós
1. **Backstabper** — passive
Ataques fora do cone frontal do alvo: +25% crit e +15% dano. Pré: Centro Mercenário

2. **Furtividade** — sustain — self — PA9 MP4/turn CD6
Invisível; quebra ao atacar ou tomar dano. Pré: 1

3. **Punhalada** — instant — single — PA9 MP0 CD2
Range 1. Dano weapon + DEX*1.6; se em stealth: +30% dano. Pré: 2

4. **Garrote** — instant — single — PA12 MP6 CD6 Dur1
Silence 1T (sem magias/skills). Teste DEX vs RES. Pré: 3

5. **Veneno Mortal** — cast — single — PA12 MP8 CD6 Dur3
DoT DEX*0.7/turn; se alvo curar, toma +DEX*0.5. Pré: 3

6. **Passo das Sombras** — instant — utility — PA12 MP10 CD5
Teleporta para trás do alvo (range 6, LoS sim). Pré: 2

7. **Bomba de Fumaça** — cast — aoe — PA12 MP10 CD7 Dur2
Raio 2: smoke + stealth possível ao entrar. Pré: 2

8. **Marca da Morte** — cast — single — PA9 MP8 CD6 Dur3
Alvo marcado: -10 RES e recebe +10% dano. Pré: 5

9. **Lâmina Oculta** — passive
Primeiro ataque após stealth custa -3 PA. Pré: 2

10. **Corte na Garganta** — instant — single — PA12 MP6 CD6
Dano weapon + DEX*1.8; aplica bleed DEX*0.4/turn 2T. Pré: 4

11. **Disfarce** — cast — utility — PA12 MP12 CD8 Dur3
Fora de combate/stealth: inimigos não reagem até você atacar. (Em combate vira -10 AIM inimigo contra você 1T). Pré: 7

12. **Golpe no Rim** — instant — single — PA12 MP6 CD7 Dur1
Stun 1T (boss: -6 PA). Teste DEX vs RES. Pré: 10

13. **Execução Silenciosa** — instant — single — PA15 MP8 CD7
Se alvo “minion” <35% HP: dano weapon + DEX*2.4. Pré: 8

14. **Correr nas Paredes** — instant — self — PA9 MP8 CD6 Dur1
Ignora altura/obstáculo leve 1T; +10 EVA. Pré: 6

15. **Shuriken** — instant — single — PA9 MP4 CD3
Range 8. Dano DEX*1.2; aplica -5 AIM 1T. Pré: 3

16. **Veneno Paralisante** — cast — single — PA12 MP10 CD8 Dur1
Root 1T. Teste DEX vs RES. Pré: 5

17. **Visão Noturna** — passive
+2 vision; ignora penalidade de smoke em 50%. Pré: 11

18. **Evasão Sobrenatural** — instant — self — PA12 MP12 CD8 Dur1
+30 EVA e reduz dano AoE em 30% 1T. Pré: 14

19. **Troca de Pele** — instant — self — PA9 MP12 CD8
Remove debuffs e entra em stealth por 1 turno (quebra se atacar). Pré: 18

20. **LÓTUS NEGRA** — ultimate — aoe — PA24 MP18 CD10
Teleporta em 3 alvos (range 8) e ataca: cada hit weapon*0.7 + DEX*1.2. Pré: 19

---

## MERCENÁRIO — SANGUINÁRIO (Carniceiro Vampírico / Arauto da Carnificina) — 20 nós
1. **Roubo de Vida** — passive
Cura 5% do dano causado (cap 10% HP/turn). Pré: Centro Mercenário

2. **Frenesi de Sangue** — passive
A cada hit: +2% dano (cap 10) até fim do combate; perde 2 stacks se passar turno sem atacar. Pré: 1

3. **Golpe Vampírico** — instant — single — PA9 MP4 CD2
Range 1. Dano weapon + STR*1.3; cura 30% do dano. Pré: 1

4. **Carniceiro** — passive
+15% dano em alvos sangrando/envenenados. Pré: 1

5. **Desmembrar** — instant — single — PA12 MP0 CD4 Dur2
Dano weapon + STR*1.6 e -10% armor 2T. Pré: 3

6. **Grito Aterrorizante** — cast — aoe — PA12 MP10 CD7 Dur1
Raio 3: fear 1T (boss: -10 AIM). Teste STR vs RES. Pré: 2

7. **Banho de Sangue** — cast — aoe — PA12 MP12 CD7
Ao matar um inimigo neste turno: cura aliados em raio 3 VIT*0.8. Pré: 1

8. **Sacrifício** — instant — single — PA12 MP0 CD6
Você perde 10% HP atual e causa dano extra + STR*1.0. Pré: 5

9. **Sede de Matança** — passive
Ao matar: reduz CD de 2 skills em 1. Pré: 2

10. **Aura de Terror** — sustain — aoe — PA9 MP5/turn CD8
Raio 2: inimigos -10 AIM. Pré: 6

11. **Investida Brutal** — instant — line — PA15 MP6 CD6
Linha 5: atravessa e dá prone (teste STR vs FORT) e dano STR*1.4 + weapon*0.5. Pré: 5

12. **Ferida Aberta** — cast — single — PA12 MP10 CD7 Dur2
Alvo: cura reduzida 70% por 2T. Teste STR vs RES. Pré: 4

13. **Canibalizar** — cast — utility — PA15 MP0 CD8
Em cadáver adjacente: cura VIT*1.6 e remove 1 debuff. Pré: 7

14. **Espinhos de Sangue** — sustain — self — PA9 MP5/turn CD7
Quem te acerta em melee toma VIT*0.8. Pré: 10

15. **Pacto de Sangue** — cast — ally — PA12 MP12 CD8 Dur2
Você transfere 15% do seu HP max pra dar escudo ao aliado (dura 2T). Pré: 12

16. **Massacre Circular** — instant — aoe — PA15 MP6 CD6
Raio 1: dano STR*1.2 + weapon*0.8. Pré: 11

17. **Coração da Besta** — passive
+10 VIT, +10% HP max. Pré: 14

18. **Cheiro de Sangue** — passive
Revela inimigos <50% HP em 10 tiles (mesmo em smoke). Pré: 17

19. **Explosão Hemática** — cast — aoe — PA18 MP16 CD9
Range 8 raio 2: dano VIT*0.8 + INT*0.8 e aplica bleed 2T. Pré: 16

20. **ARAUTO DA CARNIFICINA** — ultimate — aoe — PA24 MP18 CD10 Dur2
Por 2T: você ganha +15% dano e roubo de vida sobe a 12%; ao matar, explode em raio 1 STR*1.0. Pré: 19

---

## MERCENÁRIO — DUELISTA (Mestre do Ripostar / Lâmina Perfeita) — 20 nós
1. **Aparar** — passive
+10% chance de parry frontal (nega dano e ativa riposta se disponível). Pré: Centro Mercenário

2. **Estocada** — instant — single — PA9 MP0 CD2
Range 2. Dano weapon + DEX*1.4. Pré: 1

3. **Ripostar** — instant — single — PA9 MP4 CD3
Ativa “stance” 1T: se for atacado frontalmente em melee, contra-ataca weapon*0.8 + DEX*1.0. Pré: 1

4. **Desafio** — cast — single — PA12 MP10 CD7 Dur2
Alvo e você: +15% dano um no outro; outros inimigos -10 AIM ao atacar você. Pré: 2

5. **Finta** — instant — single — PA9 MP6 CD4 Dur1
Próximo ataque nesse alvo tem +25% crit. Pré: 2

6. **Desarmar Técnico** — instant — single — PA12 MP6 CD7 Dur1
Range 1. -30% dano do alvo 1T. Teste DEX vs FORT. Pré: 2

7. **Precisão Cirúrgica** — passive
+10 AIM e +10% crit. Pré: 5

8. **Passo Lateral** — instant — self — PA9 MP6 CD5 Dur1
+20 EVA e você pode mover 1 tile grátis após ser atacado (1x). Pré: 3

9. **Golpe no Pulso** — instant — single — PA12 MP0 CD5 Dur2
Dano weapon + DEX*1.2 e -10% dano 2T. Pré: 6

10. **Lâmina Dançante** — cast — single — PA15 MP6 CD6
4 hits: total weapon*2.0 + DEX*1.2. Pré: 7

11. **Insulto** — cast — single — PA9 MP8 CD6 Dur2
Alvo fica agressivo: -10% armor e te prioriza. Teste DEX vs RES. Pré: 4

12. **Corte nos Olhos** — instant — single — PA12 MP6 CD7 Dur1
Cegueira 1T (-20 AIM). Teste DEX vs RES. Pré: 9

13. **Defesa Impenetrável** — sustain — self — PA9 MP5/turn CD8
Imóvel. Imune a dano frontal por 1T? (balance): reduz 70% frontal por turno enquanto sustenta. Concentração. Pré: 3

14. **Mestre de Armas** — passive
Bônus de arma: +10% dano com qualquer weapon. Pré: 1

15. **Golpe de Misericórdia** — instant — single — PA12 MP0 CD4
Se alvo estiver prone/stun/root: +30% dano. Fórmula weapon + DEX*1.6. Pré: 12

16. **Quebra-Guarda** — instant — single — PA12 MP6 CD6 Dur2
Remove “defensive stance” e aplica -15% armor 2T. Teste DEX vs FORT. Pré: 10

17. **Reflexo de Lâmina** — cast — self — PA12 MP10 CD7 Dur1
Por 1T: 50% chance de cancelar projétil frontal. Pré: 13

18. **Ponto Cego** — instant — single — PA12 MP8 CD6
Teleporta 3 tiles e ataca pelas costas: weapon + DEX*1.8. Pré: 8

19. **Equilíbrio Perfeito** — passive
Imune a knockdown 1x/turn (o primeiro vira slow). Pré: 17

20. **A ARTE DA LÂMINA** — ultimate — single — PA24 MP18 CD10
Range 1-2. Grande golpe: weapon*1.2 + DEX*2.4. Se alvo não-elite e <40% HP: executa (capado). Pré: 18

---

# PATRULHEIRO

## PATRULHEIRO — SCOUT (Olheiro Fantasma / Batedor Supremo) — 20 nós
1. **Detecção Passiva** — passive
Revela traps/inimigos stealth em 2 tiles. Pré: Centro Patrulheiro

2. **Binóculo** — cast — utility — PA9 MP6 CD4 Dur1
+4 vision por 1T e revela área (sem fog no cone). Pré: 1

3. **Caminhar Silencioso** — sustain — self — PA9 MP4/turn CD6
Não ativa AoO ao mover; inimigos têm -10 detection. Pré: 1

4. **Marcar Alvo** — instant — single — PA9 MP8 CD5 Dur3
Range 10. Alvo não pode stealth e recebe +10% dano. Pré: 2

5. **Batedor Supremo** — cast — aoe — PA12 MP12 CD7 Dur2
Revela área grande (raio 6) e mostra cones inimigos no stealth mode. Pré: 2

6. **Corrida de Reconhecimento** — instant — self — PA9 MP6 CD5
Move +4 tiles (só move) e não ativa traps (1x). Pré: 3

7. **Disparo de Alerta** — instant — single — PA9 MP0 CD4
Range 10. Dano leve weapon*0.7 + DEX*0.8 e marca o alvo 1T. Pré: 4

8. **Sentidos Aguçados** — passive
+2 vision e +10 RES vs fear/trevas. Pré: 1

9. **Camuflagem Natural** — sustain — self — PA9 MP5/turn CD7
Stealth mais forte: não quebra ao virar (só ao atacar/tomar dano). Pré: 3

10. **Ataque de Guerrilha** — passive
Primeiro ataque do combate: +15% dano e +10 AIM. Pré: 4

11. **Rastrear** — cast — utility — PA9 MP8 CD6 Dur3
Mostra “rastro” de patrulha em stealth (ícones no mapa). Pré: 5

12. **Sinalizador** — cast — utility — PA12 MP10 CD6 Dur2
Ilumina área raio 3 e remove smoke. Pré: 2

13. **Escalar** — passive
Sem penalidade de altura (mover vertical custa igual). Pré: 6

14. **Análise de Inimigo** — cast — single — PA12 MP10 CD6
Range 10. Revela HP/PA e 1 resistência (MVP). Pré: 5

15. **Fuga Rápida** — instant — self — PA9 MP8 CD6
Desengaja: mover 3 tiles sem AoO e entra em cover. Pré: 6

16. **Engodo** — cast — utility — PA12 MP10 CD7 Dur2
Cria “som” num tile, inimigos investigam. Pré: 11

17. **Tiro de Perna** — instant — single — PA12 MP6 CD6 Dur1
Range 10. -2 tiles move 1T. Teste DEX vs FORT. Pré: 7

18. **Visão Térmica** — cast — self — PA12 MP12 CD8 Dur2
Vê unidades através de smoke e -50% stealth. Pré: 8

19. **Instinto de Sobrevivência** — passive
1x por missão: ignora dano de trap e ganha +6 PA no próximo turno. Pré: 15

20. **O OLHO QUE TUDO VÊ** — ultimate — utility — PA24 MP18 CD10 Dur3
Revela mapa (sem fog) e mostra facing/cones inimigos por 3T. Pré: 18

---

## PATRULHEIRO — TRAPPER / SABOTADOR — 20 nós
1. **Especialista em Armadilhas** — passive
Armadilhas +20% dano e +1 tile de trigger. Pré: Centro Patrulheiro

2. **Armadilha de Urso** — cast — utility — PA12 MP8 CD4 Dur3
Coloca trap: ao pisar, root 1T e dano DEX*1.2. Pré: 1

3. **Mina Terrestre** — cast — utility — PA12 MP10 CD5 Dur3
Explode (raio 1) DEX*1.0 + INT*0.8. Pré: 1

4. **Rede de Captura** — cast — aoe — PA15 MP12 CD7 Dur1
Range 8 raio 2: root 1T (teste DEX vs RES). Pré: 2

5. **Bomba de Gás** — cast — aoe — PA15 MP12 CD7 Dur2
Range 8 raio 2: veneno INT*0.6/turn e -10 vision. Pré: 3

6. **Estacas de Chão** — cast — aoe — PA12 MP10 CD6 Dur2
Range 8 raio 2: quem andar toma DEX*0.6. Pré: 2

7. **Sabotagem de Arma** — cast — single — PA12 MP12 CD7 Dur2
Range 8. Próximo ataque do alvo tem 30% chance de falhar e causar recoil leve. Teste INT vs RES. Pré: 5

8. **Corda de Tropeço** — cast — utility — PA12 MP8 CD6 Dur3
Linha 2 tiles: ao atravessar, prone 1T (teste DEX vs FORT). Pré: 6

9. **Isca** — cast — utility — PA9 MP8 CD5 Dur2
Atrai AI para o tile. Pré: 4

10. **Bomba de Piche** — cast — aoe — PA12 MP10 CD7 Dur2
Range 8 raio 2: terreno difícil (+3 PA/tile) e inflamável. Pré: 5

11. **Desarmar Dispositivo** — instant — utility — PA9 MP6 CD3
Remove 1 trap/objeto explosivo próximo. Pré: 1

12. **Bomba-Relógio** — cast — utility — PA15 MP14 CD8 Dur3
Coloca bomba: explode após 3T: INT*2.0 raio 2. Pré: 3

13. **Armadilha Mágica** — cast — utility — PA15 MP14 CD8 Dur2
Trap: ao pisar, silence 1T e dano INT*1.4. Pré: 5

14. **Fosso** — cast — utility — PA15 MP12 CD9 Dur3
Cria buraco (1 tile): se cair e não voar, perde turno (boss: -10 PA). Teste DEX vs FORT. Pré: 8

15. **Granada de Luz** — cast — aoe — PA12 MP12 CD7 Dur1
Range 8 raio 2: cega 1T (-20 AIM). Teste INT vs RES. Pré: 5

16. **Tóxico de Contato** — sustain — self — PA9 MP5/turn CD7
Quem te acerta em melee recebe veneno INT*0.6/turn 2T. Pré: 5

17. **Explosivo Plástico** — cast — utility — PA18 MP16 CD9
Dá dano extra em “cobertura/parede” (se seu sistema suportar destruir). Senão: grande dano em cobertura. Pré: 12

18. **Dardo Sonífero** — cast — single — PA12 MP12 CD9 Dur1
Sleep 1T (quebra ao tomar dano). Teste INT vs RES. Pré: 13

19. **Reação em Cadeia** — passive
Quando uma trap ativa, 25% de chance de ativar outra trap adjacente automaticamente. Pré: 17

20. **ZONA DA MORTE** — ultimate — utility — PA24 MP18 CD10
Ativa todas traps suas no mapa com +25% dano e +1 raio (cap). Pré: 19

---

## PATRULHEIRO — ESTRATEGISTA (General de Campo) — 20 nós
1. **Aura de Comando** — passive
Aliados a 3 tiles: +5 AIM. Pré: Centro Patrulheiro

2. **Ordem de Ataque** — cast — ally — PA12 MP12 CD7
Range 8. Aliado faz 1 ataque básico fora do turno (sem gastar PA dele). Pré: 1

3. **Formação de Defesa** — cast — aoe allies — PA12 MP12 CD6 Dur2
Raio 4: +10 armor por 2T. Pré: 1

4. **Grito de Moral** — cast — aoe allies — PA12 MP12 CD7
Raio 4: cura VIT*0.8 e remove fear. Pré: 1

5. **Focar Fogo** — cast — single — PA12 MP10 CD6 Dur2
Marca alvo: aliados causam +10% dano nele 2T. Pré: 2

6. **Recuar Tático** — instant — aoe allies — PA12 MP10 CD7
Raio 4: aliados podem mover 1 tile grátis sem AoO. Pré: 3

7. **Plano B** — instant — aoe allies — PA12 MP12 CD8
Raio 4: aliados recuperam MP INT*0.6 (do estrategista) e +3 PA (cap). Pré: 4

8. **Inspirar** — cast — ally — PA9 MP10 CD6 Dur2
Range 8. +10% crit por 2T. Pré: 4

9. **Analisar Terreno** — passive
Seu time ignora 50% penalidade de terreno difícil. Pré: 3

10. **Flanquear** — cast — aoe allies — PA12 MP10 CD7 Dur2
Raio 4: +10% dano quando atacar pelos lados/costas. Pré: 5

11. **Intimidação Tática** — cast — aoe enemies — PA12 MP12 CD7 Dur1
Raio 4: -10 AIM 1T. Teste INT vs RES. Pré: 4

12. **Primeiros Socorros de Campo** — cast — ally — PA15 MP14 CD8
Range 6. Cura INT*1.4 + VIT*0.6 e remove bleed/poison. Pré: 4

13. **Logística** — passive
Itens usados por aliados em 4 tiles têm +20% efeito. Pré: 12

14. **Observar Padrão** — cast — self — PA12 MP12 CD8 Dur2
Escolhe 1 inimigo: seu time ganha +10 EVA contra ele por 2T. Pré: 9

15. **Comando de Guarda** — cast — ally — PA12 MP12 CD7 Dur1
Range 8. Aliado entra em overwatch por 1T com +10 AIM (se seu sistema já tem). Pré: 1

16. **Sacrifício Calculado** — cast — ally — PA12 MP14 CD9
Range 6. Redireciona 40% do dano de um aliado para você por 1T; você ganha +10 RES. Pré: 12

17. **Vantagem Tática** — passive
No 1º turno do combate: time ganha +3 PA. Pré: 1

18. **Coordenação** — passive
Aliados adjacentes a outro aliado: +5 AIM (stacka com aura? não). Pré: 3

19. **Quebrar Moral** — cast — aoe enemies — PA15 MP16 CD9 Dur1
Range 8 raio 2: remove 1 buff e aplica -10 AIM 1T. Teste INT vs RES. Pré: 11

20. **XEQUE-MATE** — ultimate — aoe allies — PA24 MP18 CD10 Dur2
Raio 6: +10 AIM, +10 RES, +10% dano, +3 PA por 2T. Pré: 19

---

## PATRULHEIRO — EXPLORADOR — 20 nós
1. **Adaptação Climática** — passive
+10 RES vs fogo/gelo e ignora penalidade climática. Pré: Centro Patrulheiro

2. **Uso de Terreno** — passive
Se terminar turno em: água/grama/pedra/areia, ganha buff específico (+EVA/+RES/+move) 1T. Pré: 1

3. **Forragear** — cast — utility — PA12 MP0 CD6
Cria 1 “consumível” simples (bandagem: cura VIT*0.8) 1x por missão. Pré: 1

4. **Domar Besta** — cast — single — PA15 MP12 CD9 Dur2
Range 6. Controla besta 2T (se não existir, vira fear). Teste INT vs RES. Pré: 1

5. **Tocha** — instant — utility — PA9 MP4 CD4 Dur2
Ilumina área raio 2 e aplica burn leve em melee (+INT*0.4). Pré: 1

6. **Pedra de Amolar** — cast — ally — PA12 MP6 CD6 Dur2
Range 6. Arma de aliado: +10% dano 2T. Pré: 3

7. **Conhecimento de Anatomia** — passive
+10% dano contra bestas/animais/monstros. Pré: 1

8. **Gancho** — instant — utility — PA12 MP8 CD6
Move para tile alto/parede até 6 tiles (LoS sim). Pré: 2

9. **Cura Natural** — sustain — self — PA9 MP4/turn CD7
Cura por turno VIT*0.8. Imóvel. Pré: 3

10. **Improvisar Arma** — instant — single — PA9 MP0 CD3
Ataque com item do mapa (MVP): dano STR*1.2. Pré: 3

11. **Mestre de Natação/Escalada** — passive
Mover em água/altura custa normal. Pré: 8

12. **Identificar Ervas** — cast — utility — PA12 MP6 CD7
Cria antídoto (remove poison/bleed) 1x por missão. Pré: 3

13. **Sentido de Perigo** — passive
Evita emboscada 1x por missão (stealth mission). Pré: 1

14. **Lançar Rede** — cast — single — PA12 MP10 CD7 Dur1
Range 6. Root 1T. Teste DEX vs RES. Pré: 4

15. **Estilingue** — instant — single — PA9 MP0 CD2
Range 8. Dano DEX*1.2 e 20% chance de stun leve (-6 PA) 1T. Pré: 10

16. **Resistência a Veneno** — passive
Reduce poison em 50% e +10 RES. Pré: 12

17. **Caminho Secreto** — cast — utility — PA15 MP14 CD9
Teleporta você + 1 aliado adjacente 6 tiles (LoS não, mas precisa tile livre). Pré: 8

18. **Enxame** — cast — aoe — PA15 MP12 CD8 Dur2
Range 8 raio 2: dano INT*0.9/turn e -10 AIM. Pré: 5

19. **Banquete de Campo** — cast — aoe allies — PA18 MP14 CD9
Fora de combate: cura grande. Em combate: cura VIT*1.2 em raio 3. Pré: 9

20. **REI DA SELVA** — ultimate — utility — PA24 MP18 CD10 Dur3
Invoca 2 bestas aliadas fracas por 3T + aliados ganham +10 EVA em terreno natural. Pré: 18
