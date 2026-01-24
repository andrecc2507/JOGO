class_name WorldState
extends Node

var day: int = 1
var threat_tier: int = 1
var regions: Dictionary = {}
var flags: Array = []
var relations: Dictionary = {}
var gold: int = 0
var active_missions: Array = []
var completed_missions: Array = []
var alerts: Array = []
var mission_templates: Array = []

var content_loader := ContentLoader.new()
var campaign_director := CampaignDirector.new()
var mission_board := MissionBoard.new()

func _ready() -> void:
  add_to_group("world_state")
  _load_initial_state()
  var content := content_loader.load_all()
  mission_templates = content.get("mission_templates", {}).get("templates", [])
  campaign_director.initialize(content.get("campaign_acts", {}).get("acts", []))
  var seed_data := _load_json("res://data/mission_board_seed.json")
  mission_board.initialize(seed_data)
  add_child(campaign_director)
  add_child(mission_board)
  mission_board.refresh(self)

func _load_initial_state() -> void:
  var data := _load_json("res://data/world_state.json")
  day = int(data.get("day", 1))
  threat_tier = int(data.get("threat_tier", 1))
  regions = data.get("regions", {})
  flags = data.get("flags", [])
  relations = data.get("relations", {})
  gold = int(data.get("gold", 0))
  active_missions = data.get("active_missions", [])

func _load_json(path: String) -> Dictionary:
  if not FileAccess.file_exists(path):
    push_error("WorldState: missing %s" % path)
    return {}
  var file := FileAccess.open(path, FileAccess.READ)
  if file == null:
    return {}
  var parsed_value: Variant = JSON.parse_string(file.get_as_text())
  if parsed_value is Dictionary:
    return parsed_value as Dictionary
  return {}

func advance_day() -> void:
  day += 1
  process_timers()
  escalate_rifts()
  campaign_director.tick_day(self)
  mission_board.refresh(self)
  generate_alerts()

func process_timers() -> void:
  mission_board.tick_timers()

func escalate_rifts() -> void:
  var total_rifts := 0
  for region_id in regions.keys():
    var region: Dictionary = regions[region_id]
    var rifts := int(region.get("rifts", 0))
    if rifts > 0:
      region["pressure"] = clamp(int(region.get("pressure", 0)) + 3, 0, 100)
      region["stability"] = clamp(int(region.get("stability", 0)) - 1, 0, 100)
    total_rifts += rifts
    regions[region_id] = region
  if total_rifts >= 5:
    threat_tier = 3
  elif total_rifts >= 3:
    threat_tier = 2
  else:
    threat_tier = 1

func generate_alerts() -> void:
  alerts.clear()
  var scored := []
  for region_id in regions.keys():
    var region: Dictionary = regions[region_id]
    scored.append({"region_id": region_id, "pressure": int(region.get("pressure", 0))})
  scored.sort_custom(func(a, b): return a["pressure"] > b["pressure"])
  for i in range(min(3, scored.size())):
    alerts.append(scored[i])

func apply_director_effect(effect_id: String) -> void:
  match effect_id:
    "unlock_mission_board":
      if not flags.has("mission_board_enabled"):
        flags.append("mission_board_enabled")
    "unlock_macro_basic":
      if not flags.has("macro_action_basic"):
        flags.append("macro_action_basic")
    "unlock_diplomacy":
      if not flags.has("diplomacy_basic"):
        flags.append("diplomacy_basic")
    "unlock_martial_law":
      if not flags.has("martial_law_actions"):
        flags.append("martial_law_actions")
    "unlock_reverse_missions":
      if not flags.has("reverse_missions"):
        flags.append("reverse_missions")
    "unlock_ending_choice":
      if not flags.has("ending_choice"):
        flags.append("ending_choice")

func apply_mission_result(result: MissionResult) -> void:
  var card: Dictionary = _find_card(result.mission_id)
  if card.is_empty():
    return
  var effects: Dictionary = card.get("effects", {})
  var selected: Array = []
  if result.success:
    selected = effects.get("DO", [])
  else:
    selected = effects.get("IGNORE", [])
  for effect_id in selected:
    apply_effect(effect_id, card.get("region_id", ""))
  for flag_id in result.flags_gained:
    if not flags.has(flag_id):
      flags.append(flag_id)
  for flag_id in result.flags_lost:
    flags.erase(flag_id)
  for relation_id in result.relation_changes.keys():
    relations[relation_id] = int(relations.get(relation_id, 0)) + int(result.relation_changes[relation_id])
  gold += int(result.loot.get("gold", 0))
  completed_missions.append(result.mission_id)
  mission_board.remove_card(result.mission_id)

func apply_effect(effect_id: String, region_id: String) -> void:
  if region_id == "":
    return
  var region: Dictionary = regions.get(region_id, {})
  match effect_id:
    "reduce_rift_pressure":
      region["rifts"] = max(int(region.get("rifts", 0)) - 1, 0)
      region["pressure"] = max(int(region.get("pressure", 0)) - 10, 0)
    "rift_growth":
      region["rifts"] = min(int(region.get("rifts", 0)) + 1, 3)
    "reduce_infiltration":
      region["infiltration"] = max(int(region.get("infiltration", 0)) - 10, 0)
    "cult_spreads":
      region["infiltration"] = min(int(region.get("infiltration", 0)) + 8, 100)
    "stability_boost":
      region["stability"] = min(int(region.get("stability", 0)) + 10, 100)
    "route_blockade":
      region["pressure"] = min(int(region.get("pressure", 0)) + 12, 100)
    "reduce_pressure":
      region["pressure"] = max(int(region.get("pressure", 0)) - 8, 0)
    "pressure_spike":
      region["pressure"] = min(int(region.get("pressure", 0)) + 10, 100)
    "pressure_shift":
      region["pressure"] = min(int(region.get("pressure", 0)) + 6, 100)
    "rift_overrun":
      region["rifts"] = min(int(region.get("rifts", 0)) + 1, 3)
    _:
      pass
  regions[region_id] = region
  if effect_id == "flag_anchor_inactive":
    flags.erase("anchor_active")
  if effect_id == "anchor_active":
    if not flags.has("anchor_active"):
      flags.append("anchor_active")
  if effect_id == "flag_foreign_seal":
    if not flags.has("foreign_seal_found"):
      flags.append("foreign_seal_found")
  if effect_id == "flag_reverse_access":
    if not flags.has("reverse_access"):
      flags.append("reverse_access")
  if effect_id == "flag_mother_clause":
    if not flags.has("mother_clause_resolved"):
      flags.append("mother_clause_resolved")

func _find_card(mission_id: String) -> Dictionary:
  for card in mission_board.cards:
    if card.get("mission_id") == mission_id:
      return card
  return {}
