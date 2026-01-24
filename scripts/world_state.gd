class_name WorldState
extends Node

# Add as Autoload: WorldStateSingleton

# MVP loop contracts (não simplificar):
# - Três ações por dia: (1) escolher missão no Board (Launch/Ignore),
#   (2) ação macro (Stance/Intel/Diplomacia/Recursos) com gate,
#   (3) opcional (ou descansar/avançar dia).
# - O jogador sempre sabe o que acontece se ignorar.
# - UI mínima: Tela A (Mapa + HUD Triad), Tela B (Mission Board),
#   Tela C (Weekly Brief a cada 7 dias ou evento grande).
# - Rule of 3 para alertas: o que aconteceu / por que aconteceu / o que posso fazer.
# - Gates: no máximo 1 sistema novo por marco/semana, sempre com alerta tutorial curto.
# - Escopo “não fazer agora”: arte bonita, diplomacia profunda, economia detalhada,
#   crafting complexo, relações avançadas.
# - Ordem de implementação: WorldState+advance_day → Mission Board → Launch/Result →
#   Rule-of-3 alerts → caps/tiers de rift → gates → weekly brief.

var day: int = 1
var week: int = 1

# Macros estratégicos
var crisis_index: int = 0
var rift_network_strength: int = 0
var threat_tier: int = 1
var global_threat: int = 0
var war_pressure: int = 0
var economy_pressure: int = 0

# Estado do mundo
var regions: Dictionary = {}
var relations: Dictionary = {}
var flags: Array = []
var progression: Dictionary = {}
var alerts: Array = []
var active_missions: Array = []
var completed_missions: Array = []

# Conteúdo
var mission_templates: Array = []
var items_db: Dictionary = {}
var region_defs: Dictionary = {}
var rift_rules: Dictionary = {}

# Recursos táticos
var roster: Array[Dictionary] = []
var inventory: Dictionary = {"gold": 0, "items": []}
var gold: int = 0

var content_loader := ContentLoader.new()
var narrative_director := NarrativeDirector.new()
var mission_board := MissionBoard.new()

func _ready() -> void:
  add_to_group("world_state")
  _load_initial_state()
  var content := content_loader.load_all()
  mission_templates = content.get("mission_templates", {}).get("templates", [])
  items_db = content.get("items", {}).get("items", {})
  region_defs = content.get("regions", {})
  rift_rules = region_defs.get("rift_rules", {})
  narrative_director.initialize(content.get("campaign_acts", {}).get("acts", []))
  var seed_data := _load_json("res://data/mission_board_seed.json")
  mission_board.initialize(seed_data)
  add_child(narrative_director)
  add_child(mission_board)
  ensure_roster_seeded_if_empty()
  mission_board.refresh(self)

func _load_initial_state() -> void:
  var data := _load_json("res://data/world_state.json")
  day = int(data.get("day", 1))
  week = int(data.get("week", 1))
  threat_tier = int(data.get("threat_tier", 1))
  crisis_index = int(data.get("crisis_index", 0))
  rift_network_strength = int(data.get("rift_network_strength", 0))
  global_threat = int(data.get("global_threat", 0))
  war_pressure = int(data.get("war_pressure", 0))
  economy_pressure = int(data.get("economy_pressure", 0))
  regions = data.get("regions", {})
  flags = data.get("flags", [])
  relations = data.get("relations", {})
  progression = data.get("progression", _default_progression())
  active_missions = data.get("active_missions", [])
  completed_missions = data.get("completed_missions", [])
  roster = _coerce_dict_array(data.get("roster", []))
  inventory = data.get("inventory", {"gold": 0, "items": []})
  if inventory.is_empty():
    inventory = {"gold": 0, "items": []}
  gold = int(inventory.get("gold", 0))

func _default_progression() -> Dictionary:
  return {
    "gates_unlocked": ["map_basic", "mission_board"],
    "gate_queue": [],
    "weekly_brief_due": false
  }

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

func _coerce_dict_array(value: Array) -> Array[Dictionary]:
  var out: Array[Dictionary] = []
  for entry in value:
    if entry is Dictionary:
      out.append(entry)
  return out

# Ordem fixa do tick diário (determinístico):
# 1) Atualiza macros (drift/decay/clamp)
# 2) Processa crise/rifts (spawn + crescimento com caps)
# 3) Processa infiltração/ameaças passivas
# 4) Gera/atualiza Mission Board
# 5) Resolve efeitos de decisões antigas (timers/ignored)
# 6) Gera alertas do dia (Rule of 3)
# 7) Aplica gates (novos sistemas)
func advance_day() -> void:
  day += 1
  if day > 1 and (day - 1) % 7 == 0:
    week += 1
    progression["weekly_brief_due"] = true
  _update_macros()
  _process_rifts()
  _process_infiltration()
  mission_board.refresh(self)
  var expired_cards: Array = mission_board.tick_timers_and_collect_expired()
  _resolve_expired_cards(expired_cards)
  narrative_director.tick_day(self)
  _generate_alerts()
  _apply_gates()

func _update_macros() -> void:
  crisis_index = clamp(crisis_index + 1, 0, 100)
  rift_network_strength = clamp(rift_network_strength + int(global_threat / 10), 0, 100)
  global_threat = clamp(global_threat + _count_active_rifts() * 2 - 1, 0, 100)
  war_pressure = clamp(war_pressure + int(global_threat / 15), 0, 100)
  economy_pressure = clamp(economy_pressure + int(global_threat / 20), 0, 100)
  _recalculate_threat_tier()

func _process_rifts() -> void:
  var caps := _get_rift_caps_for_tier(threat_tier)
  var global_cap := int(caps.get("global", 3))
  var per_region_cap := int(caps.get("per_region", 1))
  var total_rifts := _count_active_rifts()

  for region_id in regions.keys():
    var region: Dictionary = regions[region_id]
    var rifts := int(region.get("rifts", 0))
    if rifts > 0:
      region["pressure"] = clamp(int(region.get("pressure", 0)) + 3, 0, 100)
      region["stability"] = clamp(int(region.get("stability", 0)) - 2, 0, 100)
    if total_rifts < global_cap and rifts < per_region_cap:
      var spawn_roll := randi_range(0, 100)
      var spawn_threshold := 90 - int(region.get("pressure", 0))
      if spawn_roll >= spawn_threshold:
        rifts += 1
        region["rifts"] = rifts
        total_rifts += 1
    regions[region_id] = region

func _process_infiltration() -> void:
  for region_id in regions.keys():
    var region: Dictionary = regions[region_id]
    var infiltration := int(region.get("infiltration", 0))
    if infiltration > 0:
      region["pressure"] = clamp(int(region.get("pressure", 0)) + 2, 0, 100)
    if int(region.get("pressure", 0)) >= 70:
      region["infiltration"] = clamp(infiltration + 1, 0, 100)
    regions[region_id] = region

func _resolve_expired_cards(expired_cards: Array) -> void:
  for card in expired_cards:
    var effects: Dictionary = card.get("effects", {})
    var ignore_effects: Array = effects.get("IGNORE", [])
    for effect in ignore_effects:
      apply_effect(effect, card.get("region_id", ""))

func _generate_alerts() -> void:
  alerts.clear()
  var scored := []
  for region_id in regions.keys():
    var region: Dictionary = regions[region_id]
    scored.append({
      "region_id": region_id,
      "pressure": int(region.get("pressure", 0)),
      "rifts": int(region.get("rifts", 0))
    })
  scored.sort_custom(func(a, b): return a["pressure"] > b["pressure"])
  for i in range(min(3, scored.size())):
    alerts.append(scored[i])

func _apply_gates() -> void:
  var queue: Array = progression.get("gate_queue", [])
  if queue.is_empty():
    return
  var next_gate: String = String(queue.pop_front())
  var unlocked: Array = progression.get("gates_unlocked", [])
  if not unlocked.has(next_gate):
    unlocked.append(next_gate)
  progression["gates_unlocked"] = unlocked
  progression["gate_queue"] = queue

func _recalculate_threat_tier() -> void:
  var total_rifts := _count_active_rifts()
  if total_rifts >= 5 or global_threat >= 70:
    threat_tier = 3
  elif total_rifts >= 3 or global_threat >= 40:
    threat_tier = 2
  else:
    threat_tier = 1

func _count_active_rifts() -> int:
  var total := 0
  for region_id in regions.keys():
    total += int(regions[region_id].get("rifts", 0))
  return total

func _get_rift_caps_for_tier(tier: int) -> Dictionary:
  var caps_by_tier: Dictionary = rift_rules.get("caps_by_tier", {})
  return caps_by_tier.get("tier_%d" % clamp(tier, 1, 3), {"global": 3, "per_region": 1})

func apply_director_effect(effect_id: String) -> void:
  match effect_id:
    "unlock_mission_board":
      _queue_gate("mission_board")
    "unlock_macro_basic":
      _queue_gate("macro_action_basic")
    "unlock_diplomacy":
      _queue_gate("diplomacy_basic")
    "unlock_martial_law":
      _queue_gate("martial_law_actions")
    "unlock_reverse_missions":
      _queue_gate("reverse_missions")
    "unlock_weekly_brief":
      _queue_gate("weekly_brief")
    "unlock_ending_choice":
      _queue_gate("ending_choice")

func _queue_gate(gate_id: String) -> void:
  var queue: Array = progression.get("gate_queue", [])
  if not queue.has(gate_id):
    queue.append(gate_id)
  progression["gate_queue"] = queue

func apply_mission_result(result: MissionResult) -> void:
  var card: Dictionary = _find_card(result.mission_id)
  if not card.is_empty():
    var effects: Dictionary = card.get("effects", {})
    var selected: Array = []
    if result.success:
      selected = effects.get("DO", [])
    else:
      selected = effects.get("IGNORE", [])
    for effect in selected:
      apply_effect(effect, card.get("region_id", ""))
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

func apply_effect(effect: Dictionary, region_id: String) -> void:
  var effect_type := String(effect.get("type", ""))
  match effect_type:
    "region_pressure":
      _apply_region_delta(region_id, "pressure", int(effect.get("delta", 0)))
    "region_stability":
      _apply_region_delta(region_id, "stability", int(effect.get("delta", 0)))
    "region_infiltration":
      _apply_region_delta(region_id, "infiltration", int(effect.get("delta", 0)))
    "region_rifts":
      _apply_region_delta(region_id, "rifts", int(effect.get("delta", 0)))
    "global_threat":
      global_threat = clamp(global_threat + int(effect.get("delta", 0)), 0, 100)
    "crisis_index":
      crisis_index = clamp(crisis_index + int(effect.get("delta", 0)), 0, 100)
    "rift_network_strength":
      rift_network_strength = clamp(rift_network_strength + int(effect.get("delta", 0)), 0, 100)
    "war_pressure":
      war_pressure = clamp(war_pressure + int(effect.get("delta", 0)), 0, 100)
    "economy_pressure":
      economy_pressure = clamp(economy_pressure + int(effect.get("delta", 0)), 0, 100)
    "flag_add":
      var flag_id := String(effect.get("flag", ""))
      if flag_id != "" and not flags.has(flag_id):
        flags.append(flag_id)
    "flag_remove":
      var flag_to_remove := String(effect.get("flag", ""))
      if flag_to_remove != "":
        flags.erase(flag_to_remove)
    "gate":
      _queue_gate(String(effect.get("gate", "")))

func _apply_region_delta(region_id: String, key: String, delta: int) -> void:
  if region_id == "":
    return
  var region: Dictionary = regions.get(region_id, {})
  if region.is_empty():
    return
  var new_value := int(region.get(key, 0)) + delta
  region[key] = clamp(new_value, 0, 100)
  regions[region_id] = region

func _find_card(mission_id: String) -> Dictionary:
  for card in mission_board.cards:
    if card.get("mission_id", "") == mission_id:
      return card
  return {}

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
  hero["equipped_item"] = item_id
  items_list.erase(item_id)
  inventory["items"] = items_list
  return true

func get_item_data(item_id: String) -> Dictionary:
  return items_db.get(item_id, {})

func get_roster_unit(unit_id: String) -> Dictionary:
  for unit in roster:
    if unit.get("id", "") == unit_id:
      return unit
  return {}

func ensure_roster_seeded_if_empty() -> void:
  if roster.size() > 0:
    return
  roster = [
    {"id": "hero_01", "name": "Capitã Rael", "level": 1, "xp": 0, "dead": false, "wounds": 0},
    {"id": "hero_02", "name": "Sargento Iven", "level": 1, "xp": 0, "dead": false, "wounds": 0}
  ]

func _apply_level_ups(hero: Dictionary) -> void:
  var level := int(hero.get("level", 1))
  var xp := int(hero.get("xp", 0))
  if xp >= 100:
    hero["level"] = level + 1
    hero["xp"] = xp - 100
