# Tutorial do JOGO (modo campanha + tático)

## 1) Visão geral rápida
O jogo tem dois níveis principais:

1) **Camada estratégica (campanha)**: você gerencia o mapa, escolhe missões no **Quadro de Missões**, decide ações macro e acompanha o avanço do tempo (dias/semanas).【F:scripts/world_state.gd†L5-L94】
2) **Camada tática (missões)**: quando você lança uma missão, entra em um combate por turnos, usando **PA (Pontos de Ação)** para mover e usar habilidades.【F:scripts/tactical/tactical_controller.gd†L1750-L1768】【F:scripts/tactical/abilities.gd†L7-L45】

O objetivo geral é controlar a escalada do **Rasgo**, das fendas e das ameaças, avançando pelos atos da campanha até os desfechos finais.【F:content/campaign_acts.json†L1-L167】【F:content/codex_entries.json†L1-L67】

---

## 2) Estrutura da campanha (o que esperar)

### Atos e progressão
A campanha é dividida em **4 atos**. Cada ato tem um resumo narrativo, gatilhos de desbloqueio e pools de missões diferentes.【F:content/campaign_acts.json†L1-L167】

- **Ato 1 – Sinais**: abertura do quadro de missões e ações básicas.【F:content/campaign_acts.json†L2-L53】
- **Ato 2 – Guerra Justa**: missões envolvendo selos e âncoras; diplomacia básica passa a existir.【F:content/campaign_acts.json†L54-L98】
- **Ato 3 – Lei Marcial**: medidas extremas e missões envolvendo o Conde Devorador.【F:content/campaign_acts.json†L99-L133】
- **Ato 4 – Reverso**: missões de ruptura e escolhas finais do destino do Rasgo.【F:content/campaign_acts.json†L134-L167】

Cada ato libera “gates” (sistemas). O jogo também dispara tutoriais curtos quando um novo gate é desbloqueado.【F:content/campaign_acts.json†L21-L167】

---

## 3) Mapa e regiões (como ler o mundo)

O mundo é dividido em regiões conectadas, cada uma com:
- **Estabilidade** (quanto mais alta, melhor),
- **Fendas (rifts)**,
- **Pressão**,
- **Infiltração**.

Esses valores mudam diariamente e afetam o risco e o surgimento de crises.【F:content/regions.json†L1-L86】【F:scripts/world_state.gd†L109-L176】

Exemplos de regiões iniciais:
- **Auréa (capital)**, **Cais Ferrugem (porto)**, **Passagem da Coroa (gargalo/hub)**, entre outras.【F:content/regions.json†L1-L86】

**Dica de leitura do mapa:**
- Regiões com **pressão alta** tendem a aumentar infiltração e gerar problemas futuros.【F:scripts/world_state.gd†L145-L176】
- Regiões com **rifts** perdem estabilidade e elevam pressão automaticamente.【F:scripts/world_state.gd†L123-L144】

---

## 4) Loop diário da campanha (passo a passo)

Todos os dias seguem um ciclo fixo. Saber isso ajuda a planejar:

1. **Atualiza variáveis globais** (crise, ameaça etc.).
2. **Processa fendas** (podem surgir/expandir).
3. **Processa infiltração**.
4. **Atualiza o Quadro de Missões**.
5. **Resolve timers expirados**.
6. **Gera alertas do dia**.
7. **Aplica gates desbloqueados**.

Esse fluxo está descrito diretamente na lógica de `WorldState.advance_day()`.【F:scripts/world_state.gd†L95-L190】

---

## 5) Quadro de Missões (como escolher o que fazer)

### Como o quadro funciona
- A cada dia, o jogo gera **3 a 6 cards de missão** (depende do tier de ameaça).【F:scripts/mission_board.gd†L3-L63】
- Cada card tem:
  - **Risco**,
  - **Recompensa**,
  - **Efeitos se fizer (DO)**,
  - **Efeitos se ignorar (IGNORE)**,
  - **Timer (dias)**,
  - **Tags** e tipo de missão.【F:scripts/mission_board.gd†L3-L103】

O jogo **sempre informa o que acontece se você ignorar** uma missão, então leia o card antes de decidir.【F:scripts/world_state.gd†L5-L15】

### Exemplos de missões
- **Mapear fenda** → reduz pressão do Rasgo se fizer, mas cresce se ignorar.【F:content/mission_templates.json†L3-L31】
- **Raid em esconderijo do culto** → reduz infiltração se fizer, mas a seita se espalha se ignorar.【F:content/mission_templates.json†L32-L64】
- **Defender gargalo** → aumenta estabilidade, mas a rota pode ser bloqueada se ignorar.【F:content/mission_templates.json†L65-L96】

---

## 6) Combate tático (como jogar a missão)

### 6.1 Controle da câmera
No combate tático, a câmera pode ser controlada com mouse e teclado:

**Mouse**
- **Scroll**: zoom in/out.
- **Botão direito**: rotaciona a câmera.
- **Botão do meio**: arrasta a câmera (pan).【F:scripts/camera/camera_rig.gd†L113-L148】

**Teclado**
- **Setas**: move a câmera.
- **, / .**: desloca a câmera no eixo vertical (subir/descer).【F:scripts/camera/camera_rig.gd†L167-L187】

---

### 6.2 Conceitos essenciais
- Cada unidade tem **PA (Pontos de Ação)**. Mover e usar habilidades consome PA.【F:scripts/tactical/unit.gd†L31-L33】【F:scripts/tactical/tactical_controller.gd†L1750-L1768】
- A UI mostra **HP**, **PA**, **SPD** e o nome do turno atual.【F:scripts/tactical/tactical_controller.gd†L1750-L1768】
- Você seleciona habilidades no **hotbar** (teclas 1–5) e executa com clique no alvo/célula.【F:scripts/tactical/tactical_controller.gd†L1217-L1237】【F:scripts/tactical/tactical_controller.gd†L1279-L1318】

---

### 6.3 Comandos úteis no combate
Dentro de uma missão tática:

- **1–5**: seleciona habilidade do hotbar (ou escolher parte do corpo se o painel de alvo estiver aberto).【F:scripts/tactical/tactical_controller.gd†L1217-L1237】
- **Page Up / Page Down**: altera o nível de visualização vertical (camadas).【F:scripts/tactical/tactical_controller.gd†L1229-L1236】
- **H**: alterna modo de visualização (visão/hit mode).【F:scripts/tactical/tactical_controller.gd†L1236-L1239】
- **T**: alterna ciclo de nível visual (outra forma de ajuste de visão).【F:scripts/tactical/tactical_controller.gd†L1239-L1243】
- **C**: liga/desliga confirmações de ação (útil para jogar rápido).【F:scripts/tactical/tactical_controller.gd†L1242-L1247】
- **TAB**: alterna o turno para outra unidade do mesmo time quando possível.【F:scripts/tactical/tactical_controller.gd†L1247-L1255】
- **O**: ativa ou desativa Overwatch (vigília).【F:scripts/tactical/tactical_controller.gd†L1254-L1261】
- **0 / ESC**: cancela a habilidade e volta para modo de movimento padrão.【F:scripts/tactical/tactical_controller.gd†L1269-L1277】

---

### 6.4 Habilidades (exemplos importantes)
Classes atuais: **Guerreiro**, **Arcano**, **Arqueiro**, **Mercenário** e **Patrulheiro**.【F:content/classes.json†L1-L420】

O jogo define kits por classe. Alguns exemplos comuns:

- **Ataque Básico (1)**: ataque padrão, custo 4 PA, alcance 8.【F:scripts/tactical/abilities.gd†L31-L38】
- **Passo Sombrio (1)**: dash curto para reposicionamento, custo 3 PA, alcance 4.【F:scripts/tactical/abilities.gd†L40-L53】
- **Hunker Down (2)**: defesa rápida, custo 2 PA, melhora cobertura.【F:scripts/tactical/abilities.gd†L55-L67】
- **Overwatch (5)**: termina o turno em vigilância, custo 3 PA.【F:scripts/tactical/abilities.gd†L69-L75】
- **Estocada Precisa (2)**: ataque curto, custo 3 PA, dano direto.【F:scripts/tactical/abilities.gd†L88-L99】
- **Luz Reconfortante (3)**: cura aliada, custo 3 PA.【F:scripts/tactical/abilities.gd†L114-L126】
- **Explosão Ígnea (4)**: AOE em área, custo 6 PA (cast de 1 turno).【F:scripts/tactical/abilities.gd†L128-L147】

**Regra geral**: se ficar sem PA, você não consegue agir (“Sem PA”).【F:scripts/tactical/tactical_controller.gd†L1379-L1384】

---

### 6.5 Como mover e atacar
1) Passe o mouse sobre a célula desejada → o jogo mostra custo de movimento e risco de OA (Opportunity Attack).【F:scripts/tactical/tactical_controller.gd†L1760-L1768】【F:scripts/tactical/tactical_controller.gd†L4537-L4565】
2) Clique para mover (o jogo pergunta o custo de PA).【F:scripts/tactical/tactical_controller.gd†L1320-L1340】
3) Se clicar diretamente em um inimigo, o jogo entra em modo de ataque/seleção de alvo.【F:scripts/tactical/tactical_controller.gd†L1308-L1318】

---

## 7) Dicas práticas para iniciantes

- **Leia o card de missão inteiro**: ele sempre mostra o que acontece se você ignorar.【F:scripts/mission_board.gd†L3-L103】【F:scripts/world_state.gd†L5-L15】
- **Controle rifts cedo**: rifts aumentam pressão e reduzem estabilidade automaticamente.【F:scripts/world_state.gd†L123-L144】
- **Use habilidades defensivas** quando precisar segurar posição (Hunker/Guard/Overwatch).【F:scripts/tactical/abilities.gd†L55-L83】
- **Planeje PA antes de agir**: mover demais pode deixar você sem PA para atacar no turno.【F:scripts/tactical/tactical_controller.gd†L1750-L1768】【F:scripts/tactical/unit.gd†L308-L313】

---

## 8) Resumo em 5 passos (versão ultra curta)

1) Veja o **Quadro de Missões** e escolha o que vale fazer hoje.
2) Leia **risco, recompensa e consequências de ignorar**.
3) Faça a missão e use **PA** para mover e atacar.
4) Termine o dia e acompanhe **pressão, fendas e infiltração**.
5) Avance pelos atos e desbloqueie novas opções.

Boa sorte, e não deixe o Rasgo dominar o mapa!
