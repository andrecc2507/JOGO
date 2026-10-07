# Sistema Matemático Central — RPG Tático (v0.2, documento de inspiração)

Texto enviado pelo design como **inspiração** ("carece de refinos e definições"). A versão aplicada no
jogo, com as decisões tomadas, está em [`../matematica.md`](../matematica.md).

**Nível máximo:** 60 · **Referência:** Ragnarok Online pré-renovação + RPG tático de linha do tempo
(Chrono Trigger / XCOM / FFT).

## Pontos principais

- Toda a matemática fica centralizada; **nenhuma skill implementa sua própria matemática de personagem**.
- Cinco atributos, **sem LUK**: STR (poder físico), DEX (precisão e execução técnica), SPD (velocidade
  temporal — frequência de ações na linha do tempo, não ASPD), INT (poder mágico, MP, resistência
  mágica), VIT (vida e resistência física).
- STR não dá carga; DEX não reduz conjuração; SPD não é ASPD de MMORPG.
- Curvas iniciais propostas:
  - `PhysicalPower = STR + floor(STR/10)²` (10 → 11, 20 → 24, 30 → 39, 40 → 56); `MagicPower` igual com INT.
  - `Accuracy = Base + DEX + equipamento + buffs + skill`, comparada à evasão do alvo.
  - `ActionInterval = 450 / (SPD + 25)` (SPD 5 → 15 s, SPD 20 → 10 s) — **provisória**, centralizada em
    `get_action_interval`.
  - `MaxHP = Base + LevelHP + VIT × HPPerVIT + equipamento + buffs`; `MaxMP` análogo com INT.
  - `PhysicalResistance = VIT / (VIT + K)` com K = 100 (retorno decrescente).
  - `MagicResistance = base + INT + equipamento + buffs − debuffs`.
- Nível 1–60, separado dos atributos. Cada nível dá **pontos de atributo** (configurável, ex.: 5) e
  **1 ponto de skill** (`StartingSkillPoints`, `SkillPointsPerLevel`, `MaxLevel` configuráveis).
- Pontos não são atributos. Custo de atributo: modelo A (1 ponto = +1) ou B (custo crescente, ex.:
  1–20 = 1, 21–40 = 2, 41–60 = 3) — decidir após testes.
- Skills com níveis (1–5), custos possivelmente crescentes por nível, pré-requisitos de nível, de
  outra skill e de atributo.
- Skills data-driven: `base_power`, `scaling` por atributo, `multiplier`, `action_time_multiplier`,
  recurso (MP), elemento, efeitos. Fórmula: `RawPower = BasePower + Σ(Atributo × Scaling)`;
  `SkillPower = RawPower × SkillMultiplier`; depois defesa, resistência, elemento, crítico, buffs,
  debuffs, penetração.
- Pipeline de combate em 22 passos (atacante, alvo, recursos, alcance, precisão, acerto, poder, escala,
  multiplicador, modificadores, defesa efetiva, penetração, elemento, crítico, arredondamento, dano,
  efeitos, próximo turno, log).
- Crítico vem de skill/arma/classe/equipamento (ex.: 15%, ×1,5). Elementos multiplicam o dano.
  Penetração: `EffectiveDefense = Defense × (1 − Penetration)`, mínimo 0.
- Buffs/debuffs separados em: modificador de atributo, de derivado, multiplicador e status. Status com
  duração, intervalo, intensidade, regras de acúmulo, chance, resistência, imunidade, dispel, prioridade.
- Equipamentos e classes usam o mesmo motor (classes definem atributos iniciais, crescimento,
  skills, equipamentos e identidade: Guerreiro STR/VIT, Ladino DEX/SPD, Mago INT).
- Linha do tempo: `NextActionTime = CurrentTime + ActionInterval × ActionTimeMultiplier` da skill
  (1,5 = lenta, 0,7 = rápida).
- Balancear olhando **dano por ação** e **dano por tempo** (SPD alto pode ter DPA menor e DPT parecido).
- Funções centrais: `get_physical_power`, `get_magic_power`, `get_accuracy`, `get_evasion`,
  `get_max_hp`, `get_max_mp`, `get_magic_resistance`, `get_physical_resistance`,
  `get_action_interval`, `calculate_hit`, `calculate_damage`, `apply_damage`, `apply_status`,
  `calculate_next_action`.
- Testes: monotonicidade (STR↑ → poder não cai; VIT↑ → HP não cai; SPD↑ → intervalo não sobe) e
  valores inválidos (zero, negativo, NaN, Infinity, divisão por zero, intervalo ≤ 0).
- Próxima etapa: planilha/simulador nível 1–60 com builds, HP, MP, dano, defesa, SPD, ações por
  minuto, DPS/DPT e tempo para matar, para descobrir quanto vale cada atributo, onde pôr soft caps e
  evitar uma combinação dominante.
