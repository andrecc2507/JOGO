extends Node

# Contratos do Mission Board (não simplificar):
# - 1 card por janela (3–7 dias), evitando spam.
# - Cada card tem risco/recompensa/impacto DO vs IGNORE/timer/tags.
# - Geração 0–N por dia/semana baseada em pressão/threat com limite anti-spam.
# - Variedade: no máximo 2 missões do mesmo tipo.

# COMO USAR:
# 1) Chame initialize(seed) uma vez e refresh(world_state) a cada dia.
# 2) Leia cards para renderizar no Map Screen.
# 3) Use remove_card ao concluir/ignorar.

var cards: Array = []
var rng := RandomNumberGenerator.new()
var last_mission_id: int = 0
var spawn_cooldown_hours: float = 0.0
var last_spawn_day: int = 0

const MIN_ACTIVE_CARDS := 2
const MAX_ACTIVE_CARDS := 4
const MAX_SAME_TYPE := 2
const MAX_SAME_FACTION := 2
const MAX_SAME_REGION := 2
const DEMO_TEMPLATE_ID := "demo_combat_loop"
const ACT0_PRESSURE_TEMPLATE_ID := "act0_pressure"
const ACT0_NEUTRAL_TEMPLATE_ID := "act0_neutral_contract"

func initialize(seed_data: Dictionary) -> void:
	rng.seed = int(seed_data.get("seed", 0))
	last_mission_id = int(seed_data.get("last_mission_id", 0))
	spawn_cooldown_hours = float(seed_data.get("spawn_cooldown_hours", 0.0))
	last_spawn_day = int(seed_data.get("last_spawn_day", 0))

func refresh(world_state: Node, force := false) -> void:
	var act: Dictionary = {}
	if world_state != null and world_state.has_method("get_current_act"):
		act = world_state.get_current_act()
	elif world_state != null and world_state.get("narrative_director") != null:
		act = world_state.narrative_director.get_current_act()
	if force:
		cards.clear()
	_ensure_demo_mission(world_state)
	if act.is_empty():
		return
	_spawn_cards_if_needed(act, world_state, force)

func _ensure_demo_mission(world_state: Node) -> void:
	if world_state == null:
		return
	for card in cards:
		if String(card.get("template_id", "")) == DEMO_TEMPLATE_ID:
			return
	var tpl := _find_template_by_id(DEMO_TEMPLATE_ID, world_state)
	if tpl.is_empty():
		return
	var demo_card := _build_card(tpl, world_state)
	if world_state.has_method("get") and world_state.get("act0_map_data") != null:
		var act0_map: Dictionary = world_state.get("act0_map_data")
		var target := _pick_act0_demo_target(act0_map)
		if not target.is_empty():
			demo_card["capital_id"] = String(target.get("capital_id", ""))
			demo_card["country_id"] = String(target.get("country_id", ""))
			demo_card["region_id"] = String(target.get("country_id", demo_card.get("region_id", "")))
	demo_card["mission_id"] = DEMO_TEMPLATE_ID
	cards.append(demo_card)

func _pick_act0_demo_target(act0_map: Dictionary) -> Dictionary:
	if act0_map.is_empty():
		return {}
	var neutral: Dictionary = act0_map.get("neutral", {})
	var neutral_id := String(neutral.get("id", ""))
	var neutral_caps: Array = neutral.get("capitals", [])
	if neutral_id != "" and not neutral_caps.is_empty():
		return {"country_id": neutral_id, "capital_id": String(neutral_caps[0].get("id", ""))}
	for country in act0_map.get("countries", []):
		var country_id := String(country.get("id", ""))
		var caps: Array = country.get("capitals", [])
		if country_id != "" and not caps.is_empty():
			return {"country_id": country_id, "capital_id": String(caps[0].get("id", ""))}
	return {}

func tick_timers() -> void:
	tick_timers_minutes(1440)

func tick_timers_and_collect_expired() -> Array:
	return tick_timers_minutes_and_collect_expired(1440)

func tick_timers_minutes(minutes: int) -> void:
	for i in range(cards.size() - 1, -1, -1):
		cards[i]["timer_minutes"] = int(cards[i].get("timer_minutes", int(cards[i].get("timer_days", 1)) * 1440)) - minutes
		if int(cards[i]["timer_minutes"]) <= 0:
			cards.remove_at(i)

func tick_timers_minutes_and_collect_expired(minutes: int) -> Array:
	var expired := []
	for i in range(cards.size() - 1, -1, -1):
		cards[i]["timer_minutes"] = int(cards[i].get("timer_minutes", int(cards[i].get("timer_days", 1)) * 1440)) - minutes
		if int(cards[i]["timer_minutes"]) <= 0:
			expired.append(cards[i])
			cards.remove_at(i)
	return expired

func advance_time(minutes: int, world_state: Node) -> Array:
	if minutes <= 0:
		return []
	var expired := tick_timers_minutes_and_collect_expired(minutes)
	spawn_cooldown_hours -= float(minutes) / 60.0
	var act: Dictionary = {}
	if world_state != null and world_state.has_method("get_current_act"):
		act = world_state.get_current_act()
	elif world_state != null and world_state.get("narrative_director") != null:
		act = world_state.narrative_director.get_current_act()
	if act.is_empty():
		return expired
	_spawn_cards_if_needed(act, world_state, false)
	return expired

func remove_card(mission_id: String) -> void:
	for i in range(cards.size() - 1, -1, -1):
		if cards[i]["mission_id"] == mission_id:
			cards.remove_at(i)
			return

func _desired_card_count(world_state: Node) -> int:
	return 1

func _spawn_count_for_window(world_state: Node) -> int:
	return 1

func _roll_spawn_cooldown_hours(world_state: Node) -> float:
	return float(rng.randi_range(72, 168))

func _spawn_cards(act: Dictionary, world_state: Node, count: int) -> void:
	if count <= 0:
		return
	var templates: Array = _select_templates(act, world_state, world_state.threat_tier, count + 2)
	var added := 0
	for template in templates:
		if added >= count:
			break
		var card := _build_card(template, world_state)
		if _can_add_card(card):
			cards.append(card)
			added += 1
	while added < count and not templates.is_empty():
		var fallback: Dictionary = templates[rng.randi_range(0, templates.size() - 1)]
		var card2 := _build_card(fallback, world_state)
		if _can_add_card(card2):
			cards.append(card2)
			added += 1

func _can_add_card(card: Dictionary) -> bool:
	if _standard_card_count() >= MAX_ACTIVE_CARDS:
		return false
	var type_counts: Dictionary = {}
	var faction_counts: Dictionary = {}
	var region_counts: Dictionary = {}
	for existing in cards:
		if _is_act0_card(existing):
			continue
		var existing_type := String(existing.get("type", ""))
		type_counts[existing_type] = int(type_counts.get(existing_type, 0)) + 1
		var existing_faction := String(existing.get("faction_id", ""))
		if existing_faction != "":
			faction_counts[existing_faction] = int(faction_counts.get(existing_faction, 0)) + 1
		var existing_region := String(existing.get("region_id", ""))
		if existing_region != "":
			region_counts[existing_region] = int(region_counts.get(existing_region, 0)) + 1
	var card_type := String(card.get("type", ""))
	if int(type_counts.get(card_type, 0)) >= MAX_SAME_TYPE:
		return false
	var card_faction := String(card.get("faction_id", ""))
	if card_faction != "" and int(faction_counts.get(card_faction, 0)) >= MAX_SAME_FACTION:
		return false
	var card_region := String(card.get("region_id", ""))
	if card_region != "" and int(region_counts.get(card_region, 0)) >= MAX_SAME_REGION:
		return false
	return true

func _select_templates(act: Dictionary, world_state: Node, threat_tier: int, desired_count: int) -> Array:
	var pool_key := "threat_tier_%d" % clampi(threat_tier, 1, 3)
	var template_ids: Array = act.get("mission_pools", {}).get(pool_key, [])
	var available := []
	for template in world_state.mission_templates:
		if template_ids.has(template.get("id")):
			available.append(template)
	if available.is_empty():
		push_warning("MissionBoard: pool vazio/mismatch para %s/%s, usando fallback" % [String(act.get("id", "")), pool_key])
		for template in world_state.mission_templates:
			if String(template.get("act", "")) == String(act.get("id", "")):
				available.append(template)
	if available.is_empty():
		available = world_state.mission_templates.duplicate()
	if available.is_empty():
		return []
	var faction_templates := _select_faction_templates(world_state, desired_count)
	for template in faction_templates:
		if not available.has(template):
			available.append(template)
	available.shuffle()
	return available.slice(0, min(desired_count, available.size()))

func _spawn_cards_if_needed(act: Dictionary, world_state: Node, force := false) -> void:
	if act.is_empty() or world_state == null:
		return
		
	var desired_count: int = min(_desired_card_count(world_state), MAX_ACTIVE_CARDS)
	desired_count = max(desired_count, MIN_ACTIVE_CARDS)
	var current_standard := _standard_card_count()
	var missing: int = max(0, desired_count - current_standard)
	
	if not force and spawn_cooldown_hours > 0.0 and current_standard >= MIN_ACTIVE_CARDS:
		return
		
	if missing <= 0 and current_standard < MIN_ACTIVE_CARDS:
		missing = MIN_ACTIVE_CARDS - current_standard
		
	if missing > 0:
		_spawn_cards(act, world_state, missing)
		
		# --- CORREÇÃO AQUI ---
		var current_day = world_state.get("day")
		if current_day != null:
			last_spawn_day = int(current_day)
		# Se for null, o last_spawn_day mantém o valor antigo (funciona como o default)
		# ---------------------
		
	if spawn_cooldown_hours <= 0.0:
		spawn_cooldown_hours = _roll_spawn_cooldown_hours(world_state)

func _select_faction_templates(world_state: Node, desired_count: int) -> Array:
	var selected: Array = []
	if world_state == null or not world_state.has_method("get_relation"):
		return selected
	var faction_defs: Dictionary = world_state.faction_defs
	for faction in faction_defs.get("factions", []):
		var fid := String(faction.get("id", ""))
		var relation := int(world_state.get_relation(fid))
		var pools: Dictionary = faction.get("request_pools", {})
		var pool_ids: Array = []
		if relation <= -20:
			pool_ids = pools.get("ultimatums", [])
		elif relation >= 15:
			pool_ids = pools.get("requests", [])
		if pool_ids.is_empty():
			continue
		for template_id in pool_ids:
			var tpl := _find_template_by_id(String(template_id), world_state)
			if not tpl.is_empty():
				selected.append(tpl)
	selected.shuffle()
	return selected.slice(0, min(desired_count, selected.size()))

func _find_template_by_id(template_id: String, world_state: Node) -> Dictionary:
	for template in world_state.mission_templates:
		if String(template.get("id", "")) == template_id:
			return template
	return {}

func _build_card(template: Dictionary, world_state: Node) -> Dictionary:
	last_mission_id += 1
	var region_id := _pick_region(template, world_state)
	var timer_range: Dictionary = template.get("timer_days", {"min": 1, "max": 1})
	var timer_days := rng.randi_range(int(timer_range.get("min", 1)), int(timer_range.get("max", 1)))
	var timer_minutes := timer_days * 1440
	var faction_id := _pick_faction_id(template, world_state, region_id)
	var map_id := ""
	if world_state != null and world_state.has_method("pick_map_id"):
		map_id = world_state.pick_map_id(template)
	return {
		"mission_id": "mission_%d" % last_mission_id,
		"template_id": template.get("id"),
		"act_id": template.get("act"),
		"region_id": region_id,
		"type": template.get("type"),
		"mission_type": template.get("mission_type", template.get("type")),
		"tags": template.get("tags", []),
		"risk": rng.randi_range(int(template.get("risk", {}).get("min", 0)), int(template.get("risk", {}).get("max", 0))),
		"reward": template.get("reward", {}),
		"timer_days": timer_days,
		"timer_minutes": timer_minutes,
		"enemy_pool_id": _pick_enemy_pool(template),
		"boss_id": _pick_boss(template),
		"objectives": _simplify_objectives(template.get("objectives", [])),
		"effects": template.get("effects", {}),
		"macro_effects_do": template.get("macro_effects_do", []),
		"macro_effects_ignore": template.get("macro_effects_ignore", []),
		"do_summary": template.get("do_summary", ""),
		"ignore_summary": template.get("ignore_summary", ""),
		"faction_id": faction_id,
		"source_faction_id": template.get("source_faction_id", ""),
		"seed": rng.randi(),
		"map_id": map_id
	}

func _pick_region(template: Dictionary, world_state: Node) -> String:
	var allowed: Array = template.get("allowed_regions", [])
	if allowed.size() == 0:
		return world_state.regions.keys().pick_random()
	return allowed.pick_random()

func _pick_enemy_pool(template: Dictionary) -> String:
	var pools: Array = template.get("enemy_pools", [])
	if pools.size() == 0:
		return ""
	return pools.pick_random()

func _pick_boss(template: Dictionary) -> Variant:
	var bosses: Array = template.get("boss_pool", [])
	if bosses.size() == 0:
		return null
	return bosses.pick_random()

func _pick_faction_id(template: Dictionary, world_state: Node, region_id: String) -> String:
	var faction_id := String(template.get("faction_id", ""))
	if faction_id != "":
		return faction_id
	var reward_relations: Dictionary = template.get("reward", {}).get("relation", {})
	if reward_relations.size() > 0:
		return String(reward_relations.keys()[0])
	if world_state != null:
		var region_state: Dictionary = world_state.regions.get(region_id, {})
		var controller := String(region_state.get("controller_faction_id", ""))
		if controller != "":
			return controller
	return ""

func _simplify_objectives(objectives: Array) -> Array:
	var simplified := []
	for obj in objectives:
		simplified.append({
			"id": obj.get("id"),
			"type": obj.get("type"),
			"description": obj.get("description")
		})
	return simplified

func _is_act0_card(card: Dictionary) -> bool:
	var card_type := String(card.get("type", ""))
	return card_type == "act0_pressure" or card_type == "neutral_contract"

func _standard_card_count() -> int:
	var count := 0
	for card in cards:
		if not _is_act0_card(card):
			count += 1
	return count

func get_act0_active_count_for_country(country_id: String) -> int:
	var count := 0
	for card in cards:
		if String(card.get("type", "")) == "act0_pressure" and String(card.get("country_id", "")) == country_id:
			count += 1
	return count

func has_act0_mission_for_capital(capital_id: String) -> bool:
	for card in cards:
		if String(card.get("capital_id", "")) == capital_id:
			return true
	return false

func spawn_act0_pressure_mission(country: Dictionary, capital_id: String, rules: Dictionary) -> bool:
	if capital_id == "" or country.is_empty():
		return false
	last_mission_id += 1
	var mission_id := "act0_pressure_%d" % last_mission_id
	var card := {
		"mission_id": mission_id,
		"template_id": ACT0_PRESSURE_TEMPLATE_ID,
		"type": "act0_pressure",
		"mission_type": "PRESSURE",
		"country_id": String(country.get("id", "")),
		"capital_id": capital_id,
		"region_id": String(country.get("id", "")),
		"name": "Expulsar arruaceiros",
		"description": "A pressão sobe. Se ignorar, instabilidade cresce.",
		"timer_minutes": int(rng.randi_range(36, 72)) * 60,
		"risk": 3,
		"reward": {"gold": 40},
		"do_summary": "Reduz pressão local.",
		"ignore_summary": "Pressão aumenta.",
		"tags": ["act0", "pressure"]
	}
	cards.append(card)
	return true

func spawn_act0_neutral_contract(neutral: Dictionary, capital_id: String) -> bool:
	if capital_id == "" or neutral.is_empty():
		return false
	last_mission_id += 1
	var mission_id := "act0_neutral_%d" % last_mission_id
	var card := {
		"mission_id": mission_id,
		"template_id": ACT0_NEUTRAL_TEMPLATE_ID,
		"type": "neutral_contract",
		"mission_type": "NEUTRAL",
		"country_id": String(neutral.get("id", "")),
		"capital_id": capital_id,
		"region_id": String(neutral.get("id", "")),
		"name": "Contrato do Interposto",
		"description": "Negociação simples que rende recursos.",
		"timer_minutes": int(rng.randi_range(48, 96)) * 60,
		"risk": 1,
		"reward": {"gold": 60, "item": "medical_supplies"},
		"do_summary": "Ganhe ouro e suprimentos.",
		"ignore_summary": "Sem efeitos.",
		"tags": ["act0", "neutral"]
	}
	cards.append(card)
	return true
