class_name WorldState
extends Node

# Add as Autoload: WorldStateSingleton

# COMO USAR:
# 1) Use reset_campaign() ao iniciar um novo jogo.
# 2) Chame advance_day() para avançar o calendário e gerar o Mission Board.
# 3) Use serialize_state()/deserialize_state() para salvar/carregar a campanha.

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
var time_minutes: int = 0

const PARTY_SIZE := 4

# Macros estratégicos
var crisis_index: int = 0
var rift_network_strength: int = 0
var threat_tier: int = 1
var global_threat: int = 0
var war_pressure: int = 0
var economy_pressure: int = 0
var macro_pressure: int = 0
var macro_infiltration: int = 0
var macro_stability: int = 50

# Estado do mundo
var regions: Dictionary = {}
var relations: Dictionary = {}
var region_influence: Dictionary = {}
var flags: Array = []
var progression: Dictionary = {}
var alerts: Array = []
var action_log: Array[String] = []
var active_missions: Array = []
var completed_missions: Array = []

# Conteúdo
var mission_templates: Array = []
var items_db: Dictionary = {}
var skill_defs: Dictionary = {}
var faction_defs: Dictionary = {}
var events_defs: Dictionary = {}
var map_defs: Dictionary = {}
var region_defs: Dictionary = {}
var rift_rules: Dictionary = {}
var biome_defs: Array = []

# Recursos táticos
var roster: Array[Dictionary] = []
var active_party_ids: Array[String] = []
var inventory: Dictionary = {"gold": 0, "items": []}
var gold: int = 0
var buildings: Dictionary = {}
var shop_state: Dictionary = {"stock": [], "last_day": 0}
var recruit_state: Dictionary = {"candidates": [], "last_day": 0}
var general_state: Dictionary = {"xp": 0, "skills_unlocked": []}
var selected_unit_id: String = ""
var unit_skill_unlocks: Dictionary = {}

var content_loader := ContentLoader.new()
var narrative_director := NarrativeDirector.new()
var campaign_director: CampaignDirector
var mission_board: MissionBoard
var _rng := RandomNumberGenerator.new()

func _ready() -> void:
	add_to_group("world_state")
	_load_initial_state()
	var content := content_loader.load_all()
	mission_templates = content.get("mission_templates", {}).get("templates", [])
	items_db = content.get("items", {}).get("items", {})
	skill_defs = content.get("skills", {})
	faction_defs = content.get("factions", {})
	events_defs = content.get("events", {})
	map_defs = content.get("maps", {})
	region_defs = content.get("regions", {})
	biome_defs = content.get("biomes", {}).get("biomes", [])
	rift_rules = region_defs.get("rift_rules", {})
	_normalize_region_state()
	narrative_director.initialize(content.get("campaign_acts", {}).get("acts", []))
	campaign_director = get_node_or_null("/root/CampaignDirector") as CampaignDirector
	if campaign_director == null:
		push_error("CampaignDirector autoload ausente")
		campaign_director = CampaignDirector.new()
		add_child(campaign_director)
	campaign_director.initialize(content.get("campaign_acts", {}).get("acts", []))
	mission_board = get_node_or_null("/root/MissionBoard") as MissionBoard
	if mission_board == null:
		push_error("MissionBoard autoload ausente")
		mission_board = MissionBoard.new()
		add_child(mission_board)
	var seed_data := _load_json("res://data/mission_board_seed.json")
	mission_board.initialize(seed_data)
	add_child(narrative_director)
	_seed_relations_from_factions()
	ensure_roster_seeded_if_empty()
	ensure_active_party_valid()
	refresh_shop_stock(true)
	refresh_recruits(true)
	mission_board.refresh(self, true)
	_normalize_region_state()

func _load_initial_state() -> void:
	var data := _load_json("res://data/world_state.json")
	day = int(data.get("day", 1))
	week = int(data.get("week", 1))
	time_minutes = int(data.get("time_minutes", 0))
	threat_tier = int(data.get("threat_tier", 1))
	crisis_index = int(data.get("crisis_index", 0))
	rift_network_strength = int(data.get("rift_network_strength", 0))
	global_threat = int(data.get("global_threat", 0))
	war_pressure = int(data.get("war_pressure", 0))
	economy_pressure = int(data.get("economy_pressure", 0))
	macro_pressure = int(data.get("macro_pressure", 0))
	macro_infiltration = int(data.get("macro_infiltration", 0))
	macro_stability = int(data.get("macro_stability", 50))
	regions = data.get("regions", {})
	flags = data.get("flags", [])
	relations = data.get("relations", {})
	region_influence = data.get("region_influence", {})
	progression = data.get("progression", _default_progression())
	active_missions = data.get("active_missions", [])
	completed_missions = data.get("completed_missions", [])
	action_log = _coerce_string_array(data.get("action_log", []))
	roster = _coerce_roster_array(data.get("roster", []) as Array)
	active_party_ids = _coerce_string_array(data.get("active_party_ids", []))
	inventory = data.get("inventory", {"gold": 0, "items": []})
	if inventory.is_empty():
		inventory = {"gold": 0, "items": []}
	gold = int(inventory.get("gold", 0))
	buildings = data.get("buildings", _default_buildings())
	shop_state = data.get("shop_state", {"stock": [], "last_day": 0})
	recruit_state = data.get("recruit_state", {"candidates": [], "last_day": 0})
	general_state = data.get("general_state", {"xp": 0, "skills_unlocked": []})
	selected_unit_id = String(data.get("selected_unit_id", ""))
	unit_skill_unlocks = data.get("unit_skill_unlocks", {})
	_normalize_region_state()

func _default_progression() -> Dictionary:
	return {
		"gates_unlocked": ["map_basic", "mission_board"],
		"gate_queue": [],
		"weekly_brief_due": false
	}

func reset_campaign() -> void:
	_load_initial_state()
	_seed_relations_from_factions()
	ensure_roster_seeded_if_empty()
	ensure_active_party_valid()
	refresh_shop_stock(true)
	refresh_recruits(true)
	mission_board.refresh(self, true)

func serialize_state() -> Dictionary:
	return {
		"day": day,
		"week": week,
		"time_minutes": time_minutes,
		"threat_tier": threat_tier,
		"crisis_index": crisis_index,
		"rift_network_strength": rift_network_strength,
		"global_threat": global_threat,
		"war_pressure": war_pressure,
		"economy_pressure": economy_pressure,
		"macro_pressure": macro_pressure,
		"macro_infiltration": macro_infiltration,
		"macro_stability": macro_stability,
		"regions": regions,
		"relations": relations,
		"region_influence": region_influence,
		"flags": flags,
		"progression": progression,
		"active_missions": active_missions,
		"completed_missions": completed_missions,
		"action_log": action_log,
		"roster": roster,
		"active_party_ids": active_party_ids,
		"inventory": inventory,
		"gold": gold,
		"buildings": buildings,
		"shop_state": shop_state,
		"recruit_state": recruit_state,
		"general_state": general_state,
		"selected_unit_id": selected_unit_id,
		"unit_skill_unlocks": unit_skill_unlocks,
		"campaign_act_id": campaign_director.current_act_id if campaign_director != null else ""
	}

func deserialize_state(data: Dictionary) -> void:
	if data.is_empty():
		return
	day = int(data.get("day", day))
	week = int(data.get("week", week))
	time_minutes = int(data.get("time_minutes", time_minutes))
	threat_tier = int(data.get("threat_tier", threat_tier))
	crisis_index = int(data.get("crisis_index", crisis_index))
	rift_network_strength = int(data.get("rift_network_strength", rift_network_strength))
	global_threat = int(data.get("global_threat", global_threat))
	war_pressure = int(data.get("war_pressure", war_pressure))
	economy_pressure = int(data.get("economy_pressure", economy_pressure))
	macro_pressure = int(data.get("macro_pressure", macro_pressure))
	macro_infiltration = int(data.get("macro_infiltration", macro_infiltration))
	macro_stability = int(data.get("macro_stability", macro_stability))
	regions = data.get("regions", regions)
	relations = data.get("relations", relations)
	region_influence = data.get("region_influence", region_influence)
	flags = data.get("flags", flags)
	progression = data.get("progression", progression)
	active_missions = data.get("active_missions", active_missions)
	completed_missions = data.get("completed_missions", completed_missions)
	action_log = _coerce_string_array(data.get("action_log", action_log))
	roster = _coerce_roster_array(data.get("roster", roster))
	active_party_ids = _coerce_string_array(data.get("active_party_ids", active_party_ids))
	inventory = data.get("inventory", inventory)
	if inventory.is_empty():
		inventory = {"gold": 0, "items": []}
	gold = int(data.get("gold", inventory.get("gold", gold)))
	buildings = data.get("buildings", buildings)
	shop_state = data.get("shop_state", shop_state)
	recruit_state = data.get("recruit_state", recruit_state)
	general_state = data.get("general_state", general_state)
	selected_unit_id = String(data.get("selected_unit_id", selected_unit_id))
	unit_skill_unlocks = data.get("unit_skill_unlocks", unit_skill_unlocks)
	if campaign_director != null and data.has("campaign_act_id"):
		campaign_director.current_act_id = String(data.get("campaign_act_id", campaign_director.current_act_id))
	ensure_roster_seeded_if_empty()
	ensure_active_party_valid()
	refresh_shop_stock(true)
	refresh_recruits(true)
	mission_board.refresh(self, true)
	_normalize_region_state()

func get_current_act() -> Dictionary:
	if campaign_director != null:
		return campaign_director.get_current_act()
	return narrative_director.get_current_act()

func set_selected_unit(id: String) -> void:
	selected_unit_id = id

func is_skill_unlocked(unit_id: String, skill_id: String) -> bool:
	if unit_id == "" or skill_id == "":
		return false
	var unit_unlocks: Dictionary = unit_skill_unlocks.get(unit_id, {})
	return bool(unit_unlocks.get(skill_id, false))

func unlock_skill(unit_id: String, skill_id: String) -> void:
	if unit_id == "" or skill_id == "":
		return
	var unit_unlocks: Dictionary = unit_skill_unlocks.get(unit_id, {})
	unit_unlocks[skill_id] = true
	unit_skill_unlocks[unit_id] = unit_unlocks

func debug_print_board_state() -> void:
	var act := get_current_act()
	var tier_key := "threat_tier_%d" % clampi(threat_tier, 1, 3)
	var cards_count := mission_board.cards.size() if mission_board != null else 0
	var cooldown := mission_board.spawn_cooldown_hours if mission_board != null else 0.0
	var last_spawn := mission_board.last_spawn_day if mission_board != null else 0
	print("BoardState day=%d hour=%d cards=%d cooldown_h=%.2f last_spawn_day=%d act=%s tier=%s" % [
		day,
		int(time_minutes / 60),
		cards_count,
		cooldown,
		last_spawn,
		String(act.get("id", "")),
		tier_key
	])

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

func _coerce_string_array(value: Variant) -> Array[String]:
	var out: Array[String] = []
	if value is Array:
		for entry in value:
			out.append(String(entry))
	return out

func _coerce_roster_array(value: Variant) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if value is Array:
		for entry in value:
			if entry is Dictionary:
				out.append(entry)
	return out

func _default_buildings() -> Dictionary:
	return {
		"headquarters": {"level": 1},
		"healer": {"level": 1},
		"shop": {"level": 1},
		"dojo": {"level": 1},
		"recruit": {"level": 1}
	}

# Ordem fixa do tick diário (determinístico):
# 1) Atualiza macros (drift/decay/clamp)
# 2) Processa crise/rifts (spawn + crescimento com caps)
# 3) Processa infiltração/ameaças passivas
# 4) Gera/atualiza Mission Board
# 5) Resolve efeitos de decisões antigas (timers/ignored)
# 6) Gera alertas do dia (Rule of 3)
# 7) Aplica gates (novos sistemas)
func advance_day(from_timeflow := false) -> void:
	day += 1
	time_minutes = 0
	if day > 1 and (day - 1) % 7 == 0:
		week += 1
		progression["weekly_brief_due"] = true
	_tick_injuries()
	_update_macros()
	_process_rifts()
	_process_infiltration()
	daily_faction_tick()
	if mission_board != null:
		mission_board.refresh(self)
	if not from_timeflow:
		if mission_board != null:
			var expired_cards: Array = mission_board.tick_timers_and_collect_expired()
			_resolve_expired_cards(expired_cards)
	if campaign_director != null:
		campaign_director.tick_day(self)
	else:
		narrative_director.tick_day(self)
	refresh_shop_stock()
	refresh_recruits()
	_generate_alerts()
	_apply_gates()

func advance_time(minutes: int) -> void:
	if minutes <= 0:
		return
	var remaining := minutes
	while remaining > 0:
		var minutes_to_day_end: int = 1440 - time_minutes
		var step: int = int(min(remaining, minutes_to_day_end))
		if mission_board != null:
			var expired_cards: Array = mission_board.advance_time(step, self)
			_resolve_expired_cards(expired_cards)
			if mission_board.cards.size() < MissionBoard.MIN_ACTIVE_CARDS or mission_board.spawn_cooldown_hours <= 0.0:
				mission_board.refresh(self)
		if campaign_director != null and campaign_director.has_method("tick_time"):
			campaign_director.tick_time(step, self)
		time_minutes += step
		remaining -= step
		if time_minutes >= 1440:
			time_minutes = 0
			advance_day(true)

func _update_macros() -> void:
	crisis_index = clampi(crisis_index + 1, 0, 100)
	rift_network_strength = clampi(rift_network_strength + int(global_threat / 10), 0, 100)
	global_threat = clampi(global_threat + _count_active_rifts() * 2 - 1, 0, 100)
	war_pressure = clampi(war_pressure + int(global_threat / 15), 0, 100)
	economy_pressure = clampi(economy_pressure + int(global_threat / 20), 0, 100)
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
			region["pressure"] = clampi(int(region.get("pressure", 0)) + 3, 0, 100)
			region["stability"] = clampi(int(region.get("stability", 0)) - 2, 0, 100)
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
			region["pressure"] = clampi(int(region.get("pressure", 0)) + 2, 0, 100)
		if int(region.get("pressure", 0)) >= 70:
			region["infiltration"] = clampi(infiltration + 1, 0, 100)
			regions[region_id] = region

func _resolve_expired_cards(expired_cards: Array) -> void:
	for card in expired_cards:
		var effects: Dictionary = card.get("effects", {})
		var ignore_effects: Array = effects.get("IGNORE", [])
		for effect in ignore_effects:
			apply_effect(effect, card.get("region_id", ""))
		var macro_ignore: Array = card.get("macro_effects_ignore", [])
		apply_macro_effects(_coerce_dict_array(macro_ignore), {
			"region_id": String(card.get("region_id", "")),
			"faction_id": String(card.get("source_faction_id", card.get("faction_id", "")))
		})

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
	return caps_by_tier.get("tier_%d" % clampi(tier, 1, 3), {"global": 3, "per_region": 1})

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

func get_relation(faction_id: String) -> int:
	if faction_id == "":
		return 0
	return int(relations.get(faction_id, 0))

func add_relation(faction_id: String, delta: int, reason: String = "") -> void:
	if faction_id == "":
		return
	var faction := _get_faction_def(faction_id)
	var limits: Dictionary = faction.get("relation", {})
	var min_val := int(limits.get("min", -100))
	var max_val := int(limits.get("max", 100))
	var current := int(relations.get(faction_id, int(limits.get("start", 0))))
	var next: int = clampi(current + delta, min_val, max_val)
	relations[faction_id] = next
	if reason != "":
		log_action("Relação %s %+d (%s) => %d" % [faction_id, delta, reason, next])

func add_influence(region_id: String, faction_id: String, delta: int, reason: String = "") -> void:
	if region_id == "" or faction_id == "":
		return
	if not region_influence.has(region_id):
		region_influence[region_id] = {}
	var region_map: Dictionary = region_influence.get(region_id, {})
	var current := int(region_map.get(faction_id, 0))
	var next: int = clampi(current + delta, 0, 100)
	region_map[faction_id] = next
	region_influence[region_id] = region_map
	if reason != "":
		log_action("Influência %s em %s %+d (%s) => %d" % [faction_id, region_id, delta, reason, next])

func apply_macro_effects(effects: Array[Dictionary], context: Dictionary) -> void:
	if effects.is_empty():
		return
	var context_region := String(context.get("region_id", ""))
	var context_faction := String(context.get("faction_id", ""))
	for effect in effects:
		var effect_type := String(effect.get("type", ""))
		var delta := int(effect.get("delta", 0))
		var reason := String(effect.get("reason", ""))
		var region_id := String(effect.get("region_id", context_region))
		var faction_id := String(effect.get("faction_id", context_faction))
		var scope := String(effect.get("scope", "region"))
		match effect_type:
			"relation":
				add_relation(faction_id, delta, reason)
			"influence":
				add_influence(region_id, faction_id, delta, reason)
			"pressure":
				if scope == "global" or region_id == "":
					macro_pressure = clampi(macro_pressure + delta, 0, 100)
					if reason != "":
						log_action("Pressão global %+d (%s) => %d" % [delta, reason, macro_pressure])
				else:
					_apply_region_delta(region_id, "pressure", delta)
			"infiltration":
				if scope == "global" or region_id == "":
					macro_infiltration = clampi(macro_infiltration + delta, 0, 100)
					if reason != "":
						log_action("Infiltração global %+d (%s) => %d" % [delta, reason, macro_infiltration])
				else:
					_apply_region_delta(region_id, "infiltration", delta)
			"stability":
				if scope == "global" or region_id == "":
					macro_stability = clampi(macro_stability + delta, 0, 100)
					if reason != "":
						log_action("Estabilidade global %+d (%s) => %d" % [delta, reason, macro_stability])
				else:
					_apply_region_delta(region_id, "stability", delta)
			"gold":
				gold = max(0, gold + delta)
				inventory["gold"] = gold
				if reason != "":
					log_action("Ouro %+d (%s) => %d" % [delta, reason, gold])
			"item_add":
				_add_item_to_inventory(String(effect.get("item_id", "")), reason)
			"item_remove":
				_remove_item_from_inventory(String(effect.get("item_id", "")), reason)
			"flag_add":
				var flag_id := String(effect.get("flag", ""))
				if flag_id != "" and not flags.has(flag_id):
					flags.append(flag_id)
					if reason != "":
						log_action("Flag adicionada %s (%s)" % [flag_id, reason])
			"flag_remove":
				var flag_remove := String(effect.get("flag", ""))
				if flag_remove != "" and flags.has(flag_remove):
					flags.erase(flag_remove)
					if reason != "":
						log_action("Flag removida %s (%s)" % [flag_remove, reason])
			"gate":
				_queue_gate(String(effect.get("gate", "")))
			"threat":
				global_threat = clampi(global_threat + delta, 0, 100)
				if reason != "":
					log_action("Ameaça global %+d (%s) => %d" % [delta, reason, global_threat])
			"region_pressure", "region_infiltration", "region_stability", "region_rifts", "global_threat", "crisis_index", "rift_network_strength", "war_pressure", "economy_pressure":
				apply_effect(effect, region_id)
			_:
				push_warning("Macro effect desconhecido: %s" % effect_type)

func daily_faction_tick() -> void:
	var faction_list: Array = faction_defs.get("factions", [])
	if faction_list.is_empty():
		return
	_seed_relations_from_factions()
	_normalize_region_state()
	for faction in faction_list:
		var faction_id := String(faction.get("id", ""))
		if faction_id == "":
			continue
		for rule in faction.get("drift_rules", []):
			var min_rel := int(rule.get("min_relation", -999))
			var max_rel := int(rule.get("max_relation", 999))
			var current := get_relation(faction_id)
			if current < min_rel or current > max_rel:
				continue
			add_relation(faction_id, int(rule.get("delta", 0)), String(rule.get("reason", "Drift")))
		for rule in faction.get("region_influence_rules", []):
			var region_tag := String(rule.get("region_tag", ""))
			if region_tag == "":
				continue
			var delta := int(rule.get("delta", 0))
			for region_def in region_defs.get("regions", []):
				var region_id := String(region_def.get("id", ""))
				var tags: Array = region_def.get("tags", [])
				if region_id != "" and tags.has(region_tag):
					add_influence(region_id, faction_id, delta, String(rule.get("reason", "Influência diária")))
		for gate in faction.get("gates", []):
			var min_rel_gate := int(gate.get("relation_min", 0))
			if get_relation(faction_id) >= min_rel_gate:
				_queue_gate(String(gate.get("unlock", "")))
		var ultimatum_flag := "ultimatum_%s" % faction_id
		if get_relation(faction_id) <= -30 and not flags.has(ultimatum_flag):
			flags.append(ultimatum_flag)
			log_action("Ultimato iniciado: %s" % faction_id)
		_process_faction_events(faction_id)

func _process_faction_events(faction_id: String) -> void:
	var events: Array = events_defs.get("faction_events", [])
	if events.is_empty():
		return
	for event in events:
		if String(event.get("faction_id", "")) != faction_id:
			continue
		var chance := float(event.get("chance", 0.0))
		if chance <= 0.0:
			continue
		if randf() <= chance:
			var description := String(event.get("description", ""))
			if description != "":
				log_action("Evento %s: %s" % [String(event.get("id", "")), description])
			var effects: Array = event.get("effects", [])
			apply_macro_effects(_coerce_dict_array(effects), {"faction_id": faction_id})

func log_action(message: String) -> void:
	if message == "":
		return
	action_log.append(message)
	if action_log.size() > 20:
		action_log = action_log.slice(action_log.size() - 20, action_log.size())

func _add_item_to_inventory(item_id: String, reason: String = "") -> void:
	if item_id == "":
		return
	var items_list: Array = inventory.get("items", [])
	items_list.append(item_id)
	inventory["items"] = items_list
	if reason != "":
		log_action("Item ganho: %s (%s)" % [item_id, reason])

func _remove_item_from_inventory(item_id: String, reason: String = "") -> void:
	if item_id == "":
		return
	var items_list: Array = inventory.get("items", [])
	if items_list.has(item_id):
		items_list.erase(item_id)
		inventory["items"] = items_list
		if reason != "":
			log_action("Item removido: %s (%s)" % [item_id, reason])

func _get_faction_def(faction_id: String) -> Dictionary:
	for faction in faction_defs.get("factions", []):
		if String(faction.get("id", "")) == faction_id:
			return faction
	return {}

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
		var macro_list: Array = card.get("macro_effects_do", []) if result.success else card.get("macro_effects_ignore", [])
		apply_macro_effects(_coerce_dict_array(macro_list), {
			"region_id": String(card.get("region_id", "")),
			"faction_id": String(card.get("source_faction_id", card.get("faction_id", "")))
		})
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
	_apply_consumables_used(result)
	_grant_general_xp(result)
	if result.mission_id != "":
		completed_missions.append(result.mission_id)
		if not card.is_empty():
			mission_board.remove_card(result.mission_id)
	var result_text := "Vitória" if result.success else "Falha"
	if result.mission_id != "":
		log_action("Missão %s: %s" % [result.mission_id, result_text])

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
			global_threat = clampi(global_threat + int(effect.get("delta", 0)), 0, 100)
		"crisis_index":
			crisis_index = clampi(crisis_index + int(effect.get("delta", 0)), 0, 100)
		"rift_network_strength":
			rift_network_strength = clampi(rift_network_strength + int(effect.get("delta", 0)), 0, 100)
		"war_pressure":
			war_pressure = clampi(war_pressure + int(effect.get("delta", 0)), 0, 100)
		"economy_pressure":
			economy_pressure = clampi(economy_pressure + int(effect.get("delta", 0)), 0, 100)
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
	region[key] = clampi(new_value, 0, 100)
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
			var base_days: int = 3
			var recovery_pct := float(_general_bonus_totals().get("wound_recovery_pct", 0))
			var adjusted_days: int = max(1, int(round(float(base_days) * (1.0 - (recovery_pct / 100.0)))))
			var injuries: Array = hero.get("injuries", [])
			injuries.append({"days_left": adjusted_days, "severity": "minor"})
			hero["injuries"] = injuries

func apply_loot_and_gold(result: MissionResult) -> void:
	var loot: Dictionary = result.loot
	var loot_gold = int(loot.get("gold", 0))
	var gold_mult := 1.0 + float(_general_bonus_totals().get("gold_reward_pct", 0)) / 100.0
	var adjusted_gold = int(round(float(loot_gold) * gold_mult))
	var loot_items: Array = loot.get("items", [])
	inventory["gold"] = int(inventory.get("gold", 0)) + adjusted_gold
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

func get_active_party() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for hero_id in active_party_ids:
		var hero := get_roster_unit(hero_id)
		if not hero.is_empty() and not bool(hero.get("dead", false)):
			out.append(hero)
	return out

func ensure_active_party_valid() -> void:
	var valid_ids: Array[String] = []
	for hero in roster:
		var hero_id := String(hero.get("id", ""))
		if hero_id == "" or bool(hero.get("dead", false)):
			continue
		if active_party_ids.has(hero_id):
			valid_ids.append(hero_id)
	active_party_ids = valid_ids
	_fill_party_to_size(PARTY_SIZE)

func _fill_party_to_size(target_size: int) -> void:
	if active_party_ids.size() >= target_size:
		return
	for hero in roster:
		var hero_id := String(hero.get("id", ""))
		if hero_id == "" or bool(hero.get("dead", false)):
			continue
		if not active_party_ids.has(hero_id):
			active_party_ids.append(hero_id)
		if active_party_ids.size() >= target_size:
			break

func set_active_party_ids(ids: Array) -> void:
	active_party_ids = _coerce_string_array(ids)
	ensure_active_party_valid()

func get_injured_heroes() -> Array[Dictionary]:
	var injured: Array[Dictionary] = []
	for hero in roster:
		var injuries: Array = hero.get("injuries", [])
		if injuries.size() > 0 and not bool(hero.get("dead", false)):
			injured.append(hero)
	return injured

func treat_hero(hero_id: String) -> bool:
	var hero := get_roster_unit(hero_id)
	if hero.is_empty():
		return false
	var injuries: Array = hero.get("injuries", [])
	if injuries.is_empty():
		return false
	var items: Array = inventory.get("items", [])
	if items.has("medical_supplies"):
		items.erase("medical_supplies")
		inventory["items"] = items
	else:
		var cost = 30
		if gold < cost:
			return false
		gold -= cost
		inventory["gold"] = gold
	for injury in injuries:
		injury["days_left"] = max(0, int(injury.get("days_left", 0)) - 1)
	hero["injuries"] = injuries
	return true

func advance_days(count: int) -> void:
	for i in range(count):
		advance_day()

func refresh_shop_stock(force := false) -> void:
	var last_day = int(shop_state.get("last_day", 0))
	if not force and last_day == day:
		return
	var items: Array = items_db.keys()
	if items.is_empty():
		shop_state = {"stock": [], "last_day": day}
		return
	_rng.seed = int(day * 101 + week * 17)
	var desired = _rng.randi_range(3, 8)
	var stock: Array = []
	while stock.size() < desired and not items.is_empty():
		var idx = _rng.randi_range(0, items.size() - 1)
		stock.append(String(items[idx]))
		items.remove_at(idx)
	shop_state = {"stock": stock, "last_day": day}

func get_shop_stock() -> Array:
	return shop_state.get("stock", [])

func purchase_item(item_id: String) -> bool:
	var stock: Array = shop_state.get("stock", [])
	if not stock.has(item_id):
		return false
	var item := get_item_data(item_id)
	if item.is_empty():
		return false
	var price = int(item.get("price", 0))
	if gold < price:
		return false
	gold -= price
	inventory["gold"] = gold
	var items_list: Array = inventory.get("items", [])
	items_list.append(item_id)
	inventory["items"] = items_list
	stock.erase(item_id)
	shop_state["stock"] = stock
	return true

func sell_item(item_id: String) -> bool:
	var items_list: Array = inventory.get("items", [])
	if not items_list.has(item_id):
		return false
	var item := get_item_data(item_id)
	var base_price = int(item.get("price", 0))
	var sell_price = int(round(base_price * 0.5))
	items_list.erase(item_id)
	inventory["items"] = items_list
	gold += sell_price
	inventory["gold"] = gold
	return true

func refresh_recruits(force := false) -> void:
	var last_day = int(recruit_state.get("last_day", 0))
	var should_refresh = force or (day - last_day) >= 7 or recruit_state.get("candidates", []).is_empty()
	if not should_refresh:
		return
	_rng.seed = int(day * 77 + week * 31)
	var count = _rng.randi_range(1, 3)
	var candidates: Array = []
	for i in range(count):
		candidates.append(_generate_candidate())
	recruit_state = {"candidates": candidates, "last_day": day}

func recruit_hero(candidate_id: String) -> bool:
	var candidates: Array = recruit_state.get("candidates", [])
	for c in candidates:
		if String(c.get("id", "")) == candidate_id:
			var cost = int(c.get("recruit_cost", 0))
			if gold < cost:
				return false
			gold -= cost
			inventory["gold"] = gold
			roster.append(c)
			candidates.erase(c)
			recruit_state["candidates"] = candidates
			ensure_active_party_valid()
			return true
	return false

func get_skill_tree_for_class(class_id: String) -> Dictionary:
	return skill_defs.get("classes", {}).get(class_id, {})

func pick_map_id(template: Dictionary) -> String:
	if template.has("story_map_id"):
		return String(template.get("story_map_id", ""))
	var story_maps: Dictionary = map_defs.get("story_maps", {})
	var template_id := String(template.get("id", ""))
	if story_maps.has(template_id):
		return String(story_maps.get(template_id, ""))
	var pool: Array = map_defs.get("common_map_pool", [])
	if pool.is_empty():
		return ""
	return String(pool.pick_random())

func build_mission_seed(card: Dictionary) -> MissionSeed:
	var consumables := _select_consumables_for_mission()
	var enriched := card.duplicate(true)
	var region_id := String(card.get("region_id", ""))
	var biome := _pick_biome_for_region(region_id, int(card.get("seed", 0)))
	if not biome.is_empty():
		enriched["biome_id"] = biome.get("id", "")
		enriched["map_profile"] = biome.get("map_profile", {})
	return MissionGenerator.new().build_seed(enriched, active_party_ids, consumables)

func get_biome_name_for_region(region_id: String, seed: int = 0) -> String:
	var biome := _pick_biome_for_region(region_id, seed)
	if biome.is_empty():
		return ""
	return String(biome.get("name", biome.get("id", "")))

func _pick_biome_for_region(region_id: String, seed: int) -> Dictionary:
	if biome_defs.is_empty():
		return {}
	var region_def := _get_region_def(region_id)
	var tags: Array = region_def.get("tags", []) if not region_def.is_empty() else []
	var matches: Array = []
	for biome in biome_defs:
		var biome_tags: Array = biome.get("tags", [])
		for tag in tags:
			if biome_tags.has(tag):
				matches.append(biome)
				break
	if matches.is_empty():
		for biome in biome_defs:
			if biome.get("tags", []).has("default"):
				matches.append(biome)
				break
	if matches.is_empty():
		matches = biome_defs
	var rng := RandomNumberGenerator.new()
	rng.seed = seed if seed != 0 else int(OS.get_unix_time_from_system())
	return matches[rng.randi_range(0, matches.size() - 1)]

func _get_region_def(region_id: String) -> Dictionary:
	for region_def in region_defs.get("regions", []):
		if String(region_def.get("id", "")) == region_id:
			return region_def
	return {}

func _select_consumables_for_mission() -> Array:
	var items_list: Array = inventory.get("items", [])
	var consumables: Array = []
	for item_id in items_list:
		var item = get_item_data(String(item_id))
		if String(item.get("type", "")) == "consumable":
			consumables.append(String(item_id))
		if consumables.size() >= 3:
			break
	return consumables

func _apply_consumables_used(result: MissionResult) -> void:
	if result == null:
		return
	var used: Array = result.consumables_used
	if used.is_empty():
		return
	var items_list: Array = inventory.get("items", [])
	for item_id in used:
		items_list.erase(String(item_id))
	inventory["items"] = items_list

func _tick_injuries() -> void:
	for hero in roster:
		var injuries: Array = hero.get("injuries", [])
		if injuries.is_empty():
			continue
		var recovery_pct := float(_general_bonus_totals().get("wound_recovery_pct", 0))
		var extra_tick := 1 if recovery_pct >= 10.0 and randi_range(0, 99) < int(recovery_pct) else 0
		for injury in injuries:
			injury["days_left"] = max(0, int(injury.get("days_left", 0)) - 1 - extra_tick)
		injuries = injuries.filter(func(i): return int(i.get("days_left", 0)) > 0)
		hero["injuries"] = injuries

func _normalize_region_state() -> void:
	var region_list: Array = region_defs.get("regions", [])
	for region_def in region_list:
		var region_id := String(region_def.get("id", ""))
		if region_id == "":
			continue
		var region_state: Dictionary = regions.get(region_id, {})
		if region_state.is_empty():
			region_state = region_def.get("initial_state", {}).duplicate(true)
		if not region_state.has("controller_faction_id"):
			region_state["controller_faction_id"] = String(region_def.get("controller_faction_id", ""))
		regions[region_id] = region_state
		if not region_influence.has(region_id):
			region_influence[region_id] = {}
		var influence_map: Dictionary = region_influence.get(region_id, {})
		for faction in faction_defs.get("factions", []):
			var fid := String(faction.get("id", ""))
			if fid != "" and not influence_map.has(fid):
				influence_map[fid] = 0
		region_influence[region_id] = influence_map

func _seed_relations_from_factions() -> void:
	var faction_list: Array = faction_defs.get("factions", [])
	for faction in faction_list:
		var fid := String(faction.get("id", ""))
		if fid != "":
			if not relations.has(fid):
				var rel_data: Dictionary = faction.get("relation", {})
				relations[fid] = int(rel_data.get("start", 0))

func ensure_roster_seeded_if_empty() -> void:
	if roster.size() > 0:
		ensure_active_party_valid()
		return
	roster = [
		_create_hero("hero_01", "Capitã Rael", "VANGUARD"),
		_create_hero("hero_02", "Sargento Iven", "GENERAL"),
		_create_hero("hero_03", "Batedora Nali", "SCOUT"),
		_create_hero("hero_04", "Mística Sael", "MYSTIC"),
		_create_hero("hero_05", "Sentinela Bronn", "VANGUARD"),
		_create_hero("hero_06", "Exploradora Tessa", "SCOUT")
	]
	active_party_ids = ["hero_01", "hero_02", "hero_03", "hero_04"]

func get_general_skill_tree() -> Dictionary:
	return skill_defs.get("general", {})

func get_general_state() -> Dictionary:
	return general_state

func unlock_general_skill(skill_id: String) -> bool:
	if skill_id == "":
		return false
	var unlocked: Array = general_state.get("skills_unlocked", [])
	if unlocked.has(skill_id):
		return false
	var tree := get_general_skill_tree()
	for line in tree.get("lines", []):
		for skill in line.get("skills", []):
			if String(skill.get("id", "")) == skill_id:
				var cost = int(skill.get("xp_cost", 0))
				if int(general_state.get("xp", 0)) < cost:
					return false
				general_state["xp"] = int(general_state.get("xp", 0)) - cost
				unlocked.append(skill_id)
				general_state["skills_unlocked"] = unlocked
				return true
	return false

func _grant_general_xp(result: MissionResult) -> void:
	if result == null:
		return
	var tree := get_general_skill_tree()
	var xp_per_mission := int(tree.get("xp_per_mission", 5))
	if result.success:
		xp_per_mission += int(tree.get("xp_bonus_on_success", 5))
	general_state["xp"] = int(general_state.get("xp", 0)) + xp_per_mission

func _general_bonus_totals() -> Dictionary:
	var totals := {
		"party_pa_max": 0,
		"party_aim_bonus": 0,
		"gold_reward_pct": 0,
		"wound_recovery_pct": 0
	}
	var unlocked: Array = general_state.get("skills_unlocked", [])
	var tree := get_general_skill_tree()
	for line in tree.get("lines", []):
		for skill in line.get("skills", []):
			if not unlocked.has(String(skill.get("id", ""))):
				continue
			for effect in skill.get("effects", []):
				var effect_type := String(effect.get("type", ""))
				if totals.has(effect_type):
					totals[effect_type] = int(totals.get(effect_type, 0)) + int(effect.get("value", 0))
	return totals

func get_general_bonus_summary() -> Dictionary:
	return _general_bonus_totals()

func _create_hero(hero_id: String, hero_name: String, class_id: String) -> Dictionary:
	return {
		"id": hero_id,
		"name": hero_name,
		"class_id": class_id,
		"level": 1,
		"xp": 0,
		"dead": false,
		"wounds": 0,
		"stats_base": _base_stats_for_class(class_id),
		"injuries": [],
		"cosmetics": {"skin_tone": "olive", "hair_style": "short", "hair_color": "black"},
		"skills_unlocked": []
	}

func _generate_candidate() -> Dictionary:
	var classes: Array[String] = ["VANGUARD", "SCOUT", "MYSTIC", "GENERAL"]
	var class_id: String = classes[_rng.randi_range(0, classes.size() - 1)]
	var base := _base_stats_for_class(class_id).duplicate(true)
	base["hp"] = int(base.get("hp", 10)) + _rng.randi_range(0, 2)
	base["aim"] = int(base.get("aim", 60)) + _rng.randi_range(-2, 4)
	var id = "recruit_%d" % _rng.randi_range(1000, 9999)
	return {
		"id": id,
		"name": "Recruta %s" % id,
		"class_id": class_id,
		"level": 1,
		"xp": 0,
		"dead": false,
		"wounds": 0,
		"stats_base": base,
		"injuries": [],
		"cosmetics": {"skin_tone": "tan", "hair_style": "medium", "hair_color": "brown"},
		"skills_unlocked": [],
		"recruit_cost": 80 + _rng.randi_range(0, 40)
	}

func _base_stats_for_class(class_id: String) -> Dictionary:
	match class_id:
		"VANGUARD":
			return {"hp": 12, "pa": 6, "aim": 60, "def": 4, "agi": 2, "move": 5}
		"SCOUT":
			return {"hp": 9, "pa": 7, "aim": 70, "def": 2, "agi": 5, "move": 7}
		"MYSTIC":
			return {"hp": 10, "pa": 6, "aim": 65, "def": 2, "agi": 3, "move": 5}
		"GENERAL":
			return {"hp": 11, "pa": 6, "aim": 62, "def": 3, "agi": 3, "move": 5}
		_:
			return {"hp": 10, "pa": 6, "aim": 60, "def": 3, "agi": 3, "move": 5}

func _apply_level_ups(hero: Dictionary) -> void:
	var level := int(hero.get("level", 1))
	var xp := int(hero.get("xp", 0))
	if xp >= 100:
		hero["level"] = level + 1
		hero["xp"] = xp - 100
		var stats: Dictionary = hero.get("stats_base", {})
		stats["hp"] = int(stats.get("hp", 10)) + 1
		stats["aim"] = int(stats.get("aim", 60)) + 1
		hero["stats_base"] = stats
