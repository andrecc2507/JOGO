class_name MissionGenerator
extends Node

# COMO USAR:
# 1) Use build_seed(card, party_ids, consumables) para criar MissionSeed.
# 2) Preencha map_id/mission_type no card quando vier do MissionBoard.
# 3) Passe o seed para o TacticalBridge.

func build_seed(card: Dictionary, party_ids: Array = [], consumables: Array = []) -> MissionSeed:
  return MissionSeed.new({
    "mission_id": card.get("mission_id", ""),
    "template_id": card.get("template_id", ""),
    "act_id": card.get("act_id", ""),
    "region_id": card.get("region_id", ""),
    "type": card.get("type", ""),
    "mission_type": card.get("mission_type", card.get("type", "")),
    "tags": card.get("tags", []),
    "risk": int(card.get("risk", 0)),
    "reward": card.get("reward", {}),
    "timer_days": int(card.get("timer_days", 1)),
    "enemy_pool_id": card.get("enemy_pool_id", ""),
    "boss_id": card.get("boss_id"),
    "objectives": card.get("objectives", []),
    "effects": card.get("effects", {}),
    "macro_effects_do": card.get("macro_effects_do", []),
    "macro_effects_ignore": card.get("macro_effects_ignore", []),
    "source_faction_id": card.get("source_faction_id", card.get("faction_id", "")),
    "seed": int(card.get("seed", 0)),
    "map_id": card.get("map_id", ""),
    "biome_id": card.get("biome_id", ""),
    "map_profile": card.get("map_profile", {}),
    "party_ids": party_ids,
    "consumables": consumables
  })
