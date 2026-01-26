# Refactor/Purification Report (Start Mission Path)

## JSON lidos diretamente (FileAccess + JSON.parse)
- `scripts/content_loader.gd` (carrega múltiplos arquivos via `CONTENT_PATHS`).
- `scripts/world_state.gd` (`_load_json` para `res://data/world_state.json` e seeds).
- `scripts/mission_generator.gd` (`res://content/regions.json`).
- `scripts/ui/map_screen.gd` (carrega dados de mapa ao abrir painel de campanha).
- `scripts/ui/skill_web.gd` (`res://content/skills_web.json`).
- `scripts/rpg/items_db.gd` (`res://content/items.json`).
- `scripts/rpg/classes_db.gd` (`res://content/classes.json`, `res://content/skills_web.json`).
- `scripts/procgen/chunk_catalog.gd` (`res://data/biomes.json`, `res://data/chunk_catalog.json`).
- `scripts/tactical/biome_map_generator.gd` (`res://data/biomes.json`).
- `scripts/tactical/gear.gd` (`res://content/items.json`).
- `scripts/core/settings.gd` (`res://data/settings.json`).
- `scripts/core/save_manager.gd` (save slots em `user://`).
- `scripts/core/save_system.gd` (save slots em `user://`).
- `scripts/debug/unused_audit.gd`, `scripts/debug/usage_audit.gd` (auditorias/debug).

## Mistura `res://data` vs `res://content` no caminho crítico
- `ContentLoader` mistura `res://data` (regions/biomes/campaign_acts/enemies/...) e `res://content` (mission_templates/items/factions/maps/skills/etc.).
- `MissionGenerator` resolve biomas a partir de `res://content/regions.json`, enquanto `ContentLoader` carrega `res://data/regions.json` para o `WorldState`. Isso pode gerar divergências ao montar `MissionSeed` (biome_id) vs conteúdo do `WorldState`.

## Padronizações feitas neste patch (caminho `start_mission`)
- `TacticalBridge` valida `template_id` consultando **apenas** `world_state.mission_templates` (carregado pelo `ContentLoader`) e aborta se ausente/inválido.
- `TacticalBridge` adiciona fallback único para `enemy_profile` quando ausente, evitando payload incompleto para o tático.
- `WorldState.get_unit_data` fornece dados normalizados para roster, evitando dependência de campos inconsistentes (`stats_base` vs `base_stats`) no envio para o tático.
