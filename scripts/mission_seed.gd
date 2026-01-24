class_name MissionSeed
extends RefCounted

var mission_id: String
var template_id: String
var act_id: String
var region_id: String
var type: String
var tags: Array
var risk: int
var reward: Dictionary
var timer_days: int
var enemy_pool_id: String
var boss_id: Variant
var objectives: Array
var effects: Dictionary
var seed: int

func _init(data: Dictionary) -> void:
  mission_id = String(data.get("mission_id", ""))
  template_id = String(data.get("template_id", ""))
  act_id = String(data.get("act_id", ""))
  region_id = String(data.get("region_id", ""))
  type = String(data.get("type", ""))
  tags = data.get("tags", [])
  risk = int(data.get("risk", 0))
  reward = data.get("reward", {})
  timer_days = int(data.get("timer_days", 1))
  enemy_pool_id = String(data.get("enemy_pool_id", ""))
  boss_id = data.get("boss_id")
  objectives = data.get("objectives", [])
  effects = data.get("effects", {})
  seed = int(data.get("seed", 0))

func to_dict() -> Dictionary:
  return {
    "mission_id": mission_id,
    "template_id": template_id,
    "act_id": act_id,
    "region_id": region_id,
    "type": type,
    "tags": tags,
    "risk": risk,
    "reward": reward,
    "timer_days": timer_days,
    "enemy_pool_id": enemy_pool_id,
    "boss_id": boss_id,
    "objectives": objectives,
    "effects": effects,
    "seed": seed
  }
