class_name WorldState
extends Node

var day: int = 1
var threat_tier: int = 1
var regions: Dictionary = {}
var flags: Array = []
var relations: Dictionary = {}
var gold: int = 0
var roster: Array[Dictionary] = []
var inventory: Dictionary = {"gold": 0, "items": []}
var progression: Dictionary = {}
var active_missions: Array = []
var completed_missions: Array = []
var alerts: Array = []
var mission_templates: Array = []
var items_db: Dictionary = {}

var content_loader := ContentLoader.new()
var campaign_director := CampaignDirector.new()
var mission_board := MissionBoard.new()

func _ready() -> void:
  add_to_group("world_state")
  _load_initial_state()
  var content := content_loader.load_all()
  mission_templates = content.get("mission_templates", {}).get("templates", [])
  items_db = content.get("items", {}).get("items", {})
  campaign_director.initialize(content.get("campaign_acts", {}).get("acts", []))
  var seed_data := _load_json("res://data/mission_board_seed.json")
  mission_board.initialize(seed_data)
  add_child(campaign_director)
  add_child(mission_board)
  ensure_roster_seeded_if_empty()
  mission_board.refresh(self)

func _load_initial_state() -> void:
  var data := _load_json("res://data/world_state.json")
  day = int(data.get("day", 1))
  threat_tier = int(data.get("threat_tier", 1))
  regions = data.get("regions", {})
  flags = data.get("flags", [])
  relations = data.get("relations", {})
  gold = int(data.get("gold", 0))
  roster = data.get("roster", [])
  inventory = data.get("inventory", {"gold": gold, "items": []})
  if inventory.is_empty():
    inventory = {"gold": gold, "items": []}
  if not inventory.has("gold"):
    inventory["gold"] = gold
  gold = int(inventory.get("gold", gold))
  progression = data.get("progression", _default_progression())
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
  if not card.is_empty():
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
  grant_xp_and_handle_levelups(result)
  apply_casualties_and_wounds(result)
  apply_loot_and_gold(result)
  if result.mission_id != "":
    completed_missions.append(result.mission_id)
    if not card.is_empty():
      mission_board.remove_card(result.mission_id)

func grant_xp_and_handle_levelups(result: MissionResult) -> void:
  var hero_results: Array = result.hero_results
  for entry in hero_results:
    var hero_id = String(entry.get("id", ""))
    var xp_gain = int(entry.get("xp", 0))
    if hero_id == "" or xp_gain <= 0:
      continue
    var hero := get_roster_unit(hero_id)
    if hero.is_empty() or bool(hero.get("dead", false)):
      continue
    hero["xp"] = int(hero.get("xp", 0)) + xp_gain
    _apply_level_ups(hero)

func apply_casualties_and_wounds(result: MissionResult) -> void:
  var hero_results: Array = result.hero_results
  for entry in hero_results:
    var hero_id = String(entry.get("id", ""))
    if hero_id == "":
      continue
    var hero := get_roster_unit(hero_id)
    if hero.is_empty():
      continue
    if bool(entry.get("dead", false)):
      hero["dead"] = true
    if bool(entry.get("wounded", false)) and not bool(hero.get("dead", false)):
      hero["wounds"] = int(hero.get("wounds", 0)) + 1

func apply_loot_and_gold(result: MissionResult) -> void:
  var loot: Dictionary = result.loot
  var loot_gold = int(loot.get("gold", 0))
  var loot_items: Array = loot.get("items", [])
  inventory["gold"] = int(inventory.get("gold", 0)) + loot_gold
  gold = int(inventory.get("gold", 0))
  var items_list: Array = inventory.get("items", [])
  for item_id in loot_items:
    items_list.append(String(item_id))
  inventory["items"] = items_list

func equip_item(hero_id: String, item_id: String) -> bool:
  if hero_id == "" or item_id == "":
    return false
  var item := get_item_data(item_id)
  if item.is_empty():
    return false
  var items_list: Array = inventory.get("items", [])
  if not items_list.has(item_id):
    return false
  var hero := get_roster_unit(hero_id)
  if hero.is_empty() or bool(hero.get("dead", false)):
    return false
  var slot = String(item.get("slot", ""))
  if slot == "":
    return false
  var gear: Dictionary = hero.get("gear", {"weapon": null, "armor": null, "charm": null})
  var existing = gear.get(slot, null)
  if existing != null:
    items_list.append(existing)
  gear[slot] = item_id
  hero["gear"] = gear
  items_list.erase(item_id)
  inventory["items"] = items_list
  return true

func unequip_slot(hero_id: String, slot: String) -> void:
  if hero_id == "" or slot == "":
    return
  var hero := get_roster_unit(hero_id)
  if hero.is_empty():
    return
  var gear: Dictionary = hero.get("gear", {"weapon": null, "armor": null, "charm": null})
  var existing = gear.get(slot, null)
  if existing != null:
    var items_list: Array = inventory.get("items", [])
    items_list.append(existing)
    inventory["items"] = items_list
  gear[slot] = null
  hero["gear"] = gear

func get_roster_unit(unit_id: String) -> Dictionary:
  for hero in roster:
    if String(hero.get("id", "")) == unit_id:
      return hero
  return {}

func get_item_data(item_id: String) -> Dictionary:
  return items_db.get(item_id, {})

func ensure_roster_seeded_if_empty() -> void:
  if not roster.is_empty():
    return
  roster = [
    _make_roster_hero("hero_001", "Batedor", {
      "hp_max": 20,
      "dex": 12,
      "agi": 14,
      "def": 8,
      "speed": 16,
      "perception": 12,
      "vision_range": 9,
      "pa_max": 8
    }, "ranger"),
    _make_roster_hero("hero_002", "Vanguarda", {
      "hp_max": 24,
      "dex": 8,
      "agi": 8,
      "def": 14,
      "speed": 8,
      "perception": 10,
      "vision_range": 9,
      "pa_max": 8
    }, "vanguard"),
    _make_roster_hero("hero_003", "Mística", {
      "hp_max": 18,
      "dex": 9,
      "agi": 10,
      "def": 9,
      "speed": 10,
      "perception": 12,
      "vision_range": 10,
      "pa_max": 8
    }, "mystic")
  ]

func _make_roster_hero(hero_id: String, hero_name: String, stats: Dictionary, kit_id: String) -> Dictionary:
  return {
    "id": hero_id,
    "name": hero_name,
    "level": 1,
    "xp": 0,
    "perk_points": 0,
    "base_stats": stats.duplicate(true),
    "wounds": 0,
    "dead": false,
    "gear": {"weapon": null, "armor": null, "charm": null},
    "abilities_kit": kit_id,
    "kit_id": kit_id,
    "notes": ""
  }

func _default_progression() -> Dictionary:
  return {
    "xp_table": [100, 250, 450, 700, 1000],
    "bonus_cycle": ["dex", "agi", "def"],
    "hp_bonus_per_level": 2
  }

func _xp_required_for_level(level: int) -> int:
  var table: Array = progression.get("xp_table", [])
  if level > 0 and level <= table.size():
    return int(table[level - 1])
  return 100 + max(0, level - 1) * 150

func _apply_level_ups(hero: Dictionary) -> void:
  var level = int(hero.get("level", 1))
  var xp = int(hero.get("xp", 0))
  var base_stats: Dictionary = hero.get("base_stats", {}).duplicate(true)
  var bonus_cycle: Array = progression.get("bonus_cycle", ["dex", "agi", "def"])
  var hp_bonus = int(progression.get("hp_bonus_per_level", 2))
  while xp >= _xp_required_for_level(level):
    xp -= _xp_required_for_level(level)
    level += 1
    hero["perk_points"] = int(hero.get("perk_points", 0)) + 1
    base_stats["hp_max"] = int(base_stats.get("hp_max", 0)) + hp_bonus
    if not bonus_cycle.is_empty():
      var bonus_key = String(bonus_cycle[(level - 2) % bonus_cycle.size()])
      base_stats[bonus_key] = int(base_stats.get(bonus_key, 0)) + 1
  hero["level"] = level
  hero["xp"] = xp
  hero["base_stats"] = base_stats

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
