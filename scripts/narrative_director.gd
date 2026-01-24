class_name NarrativeDirector
extends Node

var acts: Array = []
var current_act_id: String = ""

func initialize(acts_data: Array) -> void:
  acts = acts_data
  acts.sort_custom(func(a, b): return a.get("order", 0) < b.get("order", 0))
  if acts.size() > 0:
    current_act_id = acts[0].get("id", "")

func get_current_act() -> Dictionary:
  for act in acts:
    if act.get("id", "") == current_act_id:
      return act
  return {}

func tick_day(world_state: Node) -> void:
  var act := get_current_act()
  if act.is_empty():
    return
  for trigger in act.get("triggers", []):
    if _check_trigger(trigger, world_state):
      for effect_id in trigger.get("effects", []):
        world_state.apply_director_effect(effect_id)
  if _should_advance(act, world_state):
    advance_act()

func _should_advance(act: Dictionary, world_state: Node) -> bool:
  var conditions: Array = act.get("advance_conditions", [])
  if conditions.is_empty():
    return false
  for condition in conditions:
    if not _check_trigger(condition, world_state):
      return false
  return true

func advance_act() -> void:
  var current_index := -1
  for i in range(acts.size()):
    if acts[i].get("id", "") == current_act_id:
      current_index = i
      break
  if current_index >= 0 and current_index < acts.size() - 1:
    current_act_id = acts[current_index + 1].get("id", "")

func _check_trigger(trigger: Dictionary, world_state: Node) -> bool:
  var trigger_type := String(trigger.get("type", ""))
  var params: Dictionary = trigger.get("params", {})
  match trigger_type:
    "day_reached":
      return world_state.day >= int(params.get("day", 0))
    "week_reached":
      return world_state.week >= int(params.get("week", 0))
    "threat_tier":
      return world_state.threat_tier >= int(params.get("min", 0))
    "global_threat":
      return world_state.global_threat >= int(params.get("min", 0))
    "flag":
      return world_state.flags.has(String(params.get("flag", "")))
    "region_state":
      var key := String(params.get("key", ""))
      var min_val := int(params.get("min", 0))
      for region_id in world_state.regions.keys():
        var region: Dictionary = world_state.regions[region_id]
        if int(region.get(key, 0)) >= min_val:
          return true
      return false
    "rift_count":
      return world_state._count_active_rifts() >= int(params.get("min", 0))
    _:
      return false
