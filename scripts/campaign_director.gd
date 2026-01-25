extends Node

var acts: Array = []
var current_act_id: String = ""

func initialize(acts_data: Array) -> void:
  acts = acts_data
  acts.sort_custom(func(a, b): return a["order"] < b["order"])
  if acts.size() > 0:
    current_act_id = acts[0]["id"]

func get_current_act() -> Dictionary:
  for act in acts:
    if act["id"] == current_act_id:
      return act
  return {}

func _check_trigger(trigger: Dictionary, world_state: Node) -> bool:
  var trigger_type := String(trigger.get("type", ""))
  var params: Dictionary = trigger.get("params", {})
  match trigger_type:
    "day_reached":
      return world_state.day >= int(params.get("day", 0))
    "threat_tier":
      return world_state.threat_tier >= int(params.get("min", 0))
    "region_state":
      var key := String(params.get("key", ""))
      var min_val := int(params.get("min", 0))
      for region_id in world_state.regions.keys():
        var region: Dictionary = world_state.regions[region_id]
        if int(region.get(key, 0)) >= min_val:
          return true
      return false
    "event_flag":
      var flag := String(params.get("flag", ""))
      return world_state.flags.has(flag)
    "mission_completed":
      var mission_id := String(params.get("mission_id", ""))
      return world_state.completed_missions.has(mission_id)
    "faction_relation":
      var faction_id := String(params.get("faction_id", ""))
      var min_rel := int(params.get("min", 0))
      if world_state.has_method("get_relation"):
        return world_state.get_relation(faction_id) >= min_rel
      return false
    _:
      return false

func tick_day(world_state: Node) -> void:
  var act := get_current_act()
  if act.is_empty():
    return
  for trigger in act.get("triggers", []):
    if _check_trigger(trigger, world_state):
      for effect_id in trigger.get("effects", []):
        world_state.apply_director_effect(effect_id)

func advance_act() -> void:
  var current_index := -1
  for i in range(acts.size()):
    if acts[i]["id"] == current_act_id:
      current_index = i
      break
  if current_index >= 0 and current_index < acts.size() - 1:
    current_act_id = acts[current_index + 1]["id"]
