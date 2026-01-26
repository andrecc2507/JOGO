class_name MissionGenerator
extends Node

# COMO USAR:
# 1) Use build_seed(card, party_ids, consumables) para criar MissionSeed.
# 2) Preencha map_id/mission_type no card quando vier do MissionBoard.
# 3) Passe o seed para o TacticalBridge.

const REGIONS_PATH := "res://content/regions.json"
static var _cached_region_defs: Array = []

func build_seed(card: Dictionary, party_ids: Array = [], consumables: Array = []) -> MissionSeed:
  var biome_id := String(card.get("biome_id", ""))
  if biome_id == "":
    biome_id = _resolve_biome_from_card(card)
  if biome_id == "":
    biome_id = "forest"
    push_warning("MissionGenerator: biome_id vazio; usando fallback 'forest'.")
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
    "biome_id": biome_id,
    "map_profile": card.get("map_profile", {}),
    "party_ids": party_ids,
    "consumables": consumables
  })

func _resolve_biome_from_card(card: Dictionary) -> String:
  var region_id := String(card.get("region_id", ""))
  if region_id == "":
    return ""
  var region_def := _region_def_for_id(region_id)
  if region_def.is_empty():
    return ""
  var region_type := String(region_def.get("type", "")).to_lower()
  var tags: Array = region_def.get("tags", [])
  if tags.has("RIFT"):
    return "dungeon"
  var mapping := {
    "capital": "city",
    "port": "port",
    "mine": "mine_outside",
    "border": "mountain",
    "district": "village",
    "choke": "village"
  }
  if mapping.has(region_type):
    return String(mapping[region_type])
  return ""

func _region_def_for_id(region_id: String) -> Dictionary:
  if _cached_region_defs.is_empty():
    _cached_region_defs = _load_region_defs()
  for region_def in _cached_region_defs:
    if String(region_def.get("id", "")) == region_id:
      return region_def
  return {}

func _load_region_defs() -> Array:
  if not FileAccess.file_exists(REGIONS_PATH):
    return []
  var file := FileAccess.open(REGIONS_PATH, FileAccess.READ)
  if file == null:
    return []
  var parsed: Variant = JSON.parse_string(file.get_as_text())
  if parsed is Dictionary:
    return parsed.get("regions", [])
  return []
