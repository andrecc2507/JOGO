# Blueprint Unificado

Este documento consolida o blueprint entregue para o pacote de conteúdo e scripts do modo campanha.

## Estrutura de pastas
- `content/` contém regiões, atos, templates de missão, inimigos e entradas de códex.
- `data/` guarda o snapshot de estado inicial, gates e seed do mission board.
- `scripts/` implementa `WorldState`, `CampaignDirector`, `MissionBoard`, contratos e loader.
- `scene/ui/` contém telas base de mapa, quadro de missões e briefing semanal.

## Regras essenciais
- `WorldState.advance_day()` executa: `process_timers`, `escalate_rifts`, `tick_day`, `mission_board.refresh`, `generate_alerts`.
- O `MissionBoard` gera 3 a 6 cards com `DO/IGNORE`, `timer`, `risk/reward` e tags.
- O `CampaignDirector` usa triggers e gates definidos em `campaign_acts.json`.
- `MissionSeed` e `MissionResult` seguem os contratos e são aplicados por `apply_mission_result`.
