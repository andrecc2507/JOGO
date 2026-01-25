class_name MissionSeed
extends RefCounted

# COMO USAR:
# 1) Crie com MissionSeed.new(data) a partir de um card do MissionBoard.
# 2) Inclua party_ids/consumables/map_id para o tático.
# 3) Use to_dict() para salvar em snapshot ou debug.

var mission_id: String
var template_id: String
var act_id: String
var region_id: String
var type: String
var mission_type: String
var tags: Array
var risk: int
var reward: Dictionary
var timer_days: int
var enemy_pool_id: String
var boss_id: Variant
var objectives: Array
var effects: Dictionary
var macro_effects_do: Array
var macro_effects_ignore: Array
var source_faction_id: String
var seed: int
var map_id: String
var biome_id: String
var map_profile: Dictionary
var party_ids: Array
var consumables: Array

func _init(data: Dictionary) -> void:
  mission_id = String(data.get("mission_id", ""))
  template_id = String(data.get("template_id", ""))
  act_id = String(data.get("act_id", ""))
  region_id = String(data.get("region_id", ""))
  type = String(data.get("type", ""))
  mission_type = String(data.get("mission_type", data.get("type", "")))
  tags = data.get("tags", [])
  risk = int(data.get("risk", 0))
  reward = data.get("reward", {})
  timer_days = int(data.get("timer_days", 1))
  enemy_pool_id = String(data.get("enemy_pool_id", ""))
  boss_id = data.get("boss_id")
  objectives = data.get("objectives", [])
  effects = data.get("effects", {})
  macro_effects_do = data.get("macro_effects_do", [])
  macro_effects_ignore = data.get("macro_effects_ignore", [])
  source_faction_id = String(data.get("source_faction_id", ""))
  seed = int(data.get("seed", 0))
  map_id = String(data.get("map_id", ""))
  biome_id = String(data.get("biome_id", ""))
  map_profile = data.get("map_profile", {})
  party_ids = data.get("party_ids", [])
  consumables = data.get("consumables", [])

func to_dict() -> Dictionary:
  return {
    "mission_id": mission_id,
    "template_id": template_id,
    "act_id": act_id,
    "region_id": region_id,
    "type": type,
    "mission_type": mission_type,
    "tags": tags,
    "risk": risk,
    "reward": reward,
    "timer_days": timer_days,
    "enemy_pool_id": enemy_pool_id,
    "boss_id": boss_id,
    "objectives": objectives,
    "effects": effects,
    "macro_effects_do": macro_effects_do,
    "macro_effects_ignore": macro_effects_ignore,
    "source_faction_id": source_faction_id,
    "seed": seed,
    "map_id": map_id,
    "biome_id": biome_id,
    "map_profile": map_profile,
    "party_ids": party_ids,
    "consumables": consumables
  }
