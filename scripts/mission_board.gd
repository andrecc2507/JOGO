class_name MissionBoard
extends Node

# Contratos do Mission Board (não simplificar):
# - 3–6 cards por dia (dependente do threat tier).
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

const MAX_ACTIVE_CARDS := 6
const MAX_SAME_TYPE := 2
const MAX_SAME_FACTION := 2
const MAX_SAME_REGION := 2

func initialize(seed_data: Dictionary) -> void:
	rng.seed = int(seed_data.get("seed", 0))
	last_mission_id = int(seed_data.get("last_mission_id", 0))
	spawn_cooldown_hours = float(seed_data.get("spawn_cooldown_hours", 0.0))

func refresh(world_state: Node, force := false) -> void:
	var act: Dictionary = {}
	if world_state != null and world_state.has_method("get_current_act"):
		act = world_state.get_current_act()
	elif world_state != null and world_state.get("narrative_director") != null:
		act = world_state.narrative_director.get_current_act()
	if act.is_empty():
		return
	if force:
		cards.clear()
	var desired_count := min(_desired_card_count(world_state), MAX_ACTIVE_CARDS)
	var missing := max(0, desired_count - cards.size())
	if missing <= 0:
		if spawn_cooldown_hours <= 0.0:
			spawn_cooldown_hours = _roll_spawn_cooldown_hours(world_state)
		return
	_spawn_cards(act, world_state, missing)
	if spawn_cooldown_hours <= 0.0:
		spawn_cooldown_hours = _roll_spawn_cooldown_hours(world_state)

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
	if spawn_cooldown_hours > 0:
		return expired
	var act: Dictionary = {}
	if world_state != null and world_state.has_method("get_current_act"):
		act = world_state.get_current_act()
	elif world_state != null and world_state.get("narrative_director") != null:
		act = world_state.narrative_director.get_current_act()
	if act.is_empty():
		return expired
	var spawn_count := _spawn_count_for_window(world_state)
	spawn_count = min(spawn_count, MAX_ACTIVE_CARDS - cards.size())
	if spawn_count > 0:
		_spawn_cards(act, world_state, spawn_count)
	spawn_cooldown_hours = _roll_spawn_cooldown_hours(world_state)
	return expired

func remove_card(mission_id: String) -> void:
	for i in range(cards.size() - 1, -1, -1):
		if cards[i]["mission_id"] == mission_id:
			cards.remove_at(i)
			return

func _desired_card_count(world_state: Node) -> int:
	var tier: int = world_state.threat_tier
	if tier <= 1:
		return rng.randi_range(3, 4)
	if tier == 2:
		return rng.randi_range(4, 5)
	return rng.randi_range(5, 6)

func _spawn_count_for_window(world_state: Node) -> int:
	var tier := int(world_state.threat_tier)
	if tier <= 1:
		return rng.randi_range(1, 2)
	if tier == 2:
		return rng.randi_range(1, 2)
	return rng.randi_range(2, 3)

func _roll_spawn_cooldown_hours(world_state: Node) -> float:
	var tier := int(world_state.threat_tier)
	if tier <= 1:
		return float(rng.randi_range(12, 18))
	if tier == 2:
		return float(rng.randi_range(8, 14))
	return float(rng.randi_range(6, 10))

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
	if cards.size() >= MAX_ACTIVE_CARDS:
		return false
	var type_counts: Dictionary = {}
	var faction_counts: Dictionary = {}
	var region_counts: Dictionary = {}
	for existing in cards:
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
	var pool_key := "threat_tier_%d" % clamp(threat_tier, 1, 3)
	var template_ids: Array = act.get("mission_pools", {}).get(pool_key, [])
	var available := []
	for template in world_state.mission_templates:
		if template_ids.has(template.get("id")):
			available.append(template)
	available.shuffle()
	return available.slice(0, min(desired_count, available.size()))

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
		"do_summary": template.get("do_summary", ""),
		"ignore_summary": template.get("ignore_summary", ""),
		"faction_id": faction_id,
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
